import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyPayment, createFakeProvider, type FakeProvider } from '@xstore/billing';
import { resetDatabase } from '@xstore/db/testing';
import { sendPaymentPaid } from '@xstore/mail';
import { mailpitMessages, testSmtpUrl, waitForMail } from '@xstore/mail/testing';
import { QueueName } from '@xstore/shared';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { expireOrders } from '../src/billing/expire-orders.js';
import { reconcileOrders } from '../src/billing/reconcile.js';
import { loadWorkerConfig } from '../src/config.js';
import { closeWorkerDeps, createWorkerDeps, type WorkerDeps } from '../src/deps.js';
import { scheduleBillingJobs } from '../src/queues/billing.js';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (!process.env.DATABASE_URL_TEST && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const SECRET = 'test-fake-webhook-secret';
const MIN = 60_000;
const HOUR = 60 * MIN;
const dbUrl = process.env.DATABASE_URL_TEST ?? '';
/** Mailpit is shared and never cleared: recipients are unique per run. */
const RUN = randomUUID().slice(0, 8);

let deps: WorkerDeps;
let fake: FakeProvider;
let planId: string;
let seq = 0;

function env(overrides: Record<string, string> = {}) {
  const e = process.env;
  return loadWorkerConfig({
    DATABASE_URL: e.DATABASE_URL_TEST,
    REDIS_URL: e.REDIS_URL_TEST,
    S3_ENDPOINT: e.S3_ENDPOINT,
    S3_REGION: e.S3_REGION,
    S3_ACCESS_KEY: e.S3_ACCESS_KEY,
    S3_SECRET_KEY: e.S3_SECRET_KEY,
    S3_BUCKET_PREFIX: e.S3_BUCKET_PREFIX_TEST,
    LOG_LEVEL: 'error',
    PAYMENT_PROVIDER: 'fake',
    FAKE_PAYMENT_WEBHOOK_SECRET: SECRET,
    SMTP_URL: testSmtpUrl(),
    MAIL_FROM: 'Xstore <noreply@xstorex.test>',
    ...overrides,
  });
}

beforeAll(() => {
  deps = createWorkerDeps(env(), pino({ level: 'silent' }));
  fake = createFakeProvider(deps.connection, {
    siteUrl: 'http://localhost:3000',
    webhookSecret: SECRET,
  });
});

beforeEach(async () => {
  await deps.queues[QueueName.billing].obliterate({ force: true });
  await deps.connection.flushdb();
  await resetDatabase(dbUrl);
  const plan = await deps.db.plan.create({
    data: {
      code: 'month',
      title: 'Подписка на месяц',
      durationDays: 30,
      priceRub: 1,
      active: true,
    },
  });
  planId = plan.id;
});

afterAll(async () => {
  await closeWorkerDeps(deps);
});

/** An order of `ageMs` age. `payment` false leaves it `created` without a provider payment. */
async function makeOrder(
  ageMs: number,
  opts: { status?: 'created' | 'pending'; payment?: boolean } = {},
) {
  const n = ++seq;
  const user = await deps.db.user.create({
    data: { isProvisional: true, checkoutEmail: `b${n}-${RUN}@example.ru` },
  });
  const sub = await deps.db.subscription.create({ data: { userId: user.id } });
  const createdAt = new Date(Date.now() - ageMs);
  let providerPaymentId: string | null = null;
  if (opts.payment !== false) {
    const p = await fake.createPayment({
      orderId: `o${n}`,
      amountRub: 1,
      description: 'test',
      returnUrl: 'http://localhost:3000/',
      idempotencyKey: `idem-${n}`,
    });
    providerPaymentId = p.providerPaymentId;
  }
  const order = await deps.db.order.create({
    data: {
      userId: user.id,
      subscriptionId: sub.id,
      planId,
      planSnapshot: { code: 'month', title: 'Подписка на месяц', durationDays: 30, priceRub: 1 },
      checkoutEmail: `b${n}-${RUN}@example.ru`,
      checkoutKey: `key-${n}`,
      amountRub: 1,
      status: opts.status ?? 'pending',
      provider: 'fake',
      providerPaymentId,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 24 * HOUR),
    },
  });
  return { order, paymentId: providerPaymentId ?? '' };
}

it('reconcile grants access for missed webhook', async () => {
  const { order, paymentId } = await makeOrder(11 * MIN);
  const paidAt = new Date(Date.now() - 2 * MIN);
  await fake.setStatus(paymentId, 'paid', paidAt);

  await reconcileOrders(deps);

  const after = await deps.db.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(after.status).toBe('paid');
  expect(after.paidAt?.toISOString()).toBe(paidAt.toISOString());
  expect(await deps.db.entitlement.count({ where: { orderId: order.id } })).toBe(1);
});

it('reconcile with provider failed marks the order failed', async () => {
  const { order, paymentId } = await makeOrder(11 * MIN);
  await fake.setStatus(paymentId, 'failed');

  await reconcileOrders(deps);

  expect((await deps.db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
    'failed',
  );
});

it('reconcile reaches orders beyond the first batch', async () => {
  // Older abandoned orders stay pending at the provider and fill the first batches.
  await makeOrder(3 * HOUR);
  await makeOrder(2 * HOUR);
  const late = await makeOrder(11 * MIN);
  await fake.setStatus(late.paymentId, 'paid', new Date(Date.now() - 2 * MIN));

  await reconcileOrders(deps, new Date(), 2);

  expect((await deps.db.order.findUniqueOrThrow({ where: { id: late.order.id } })).status).toBe(
    'paid',
  );
});

it('expireOrders reaches orders beyond the first batch', async () => {
  await makeOrder(27 * HOUR);
  await makeOrder(26 * HOUR);
  const late = await makeOrder(25 * HOUR);
  await fake.setStatus(late.paymentId, 'failed');

  await expireOrders(deps, new Date(), 2);

  expect((await deps.db.order.findUniqueOrThrow({ where: { id: late.order.id } })).status).toBe(
    'expired',
  );
});

it('reconcile leaves fresh and still-pending orders alone', async () => {
  const fresh = await makeOrder(5 * MIN);
  await fake.setStatus(fresh.paymentId, 'paid');
  const waiting = await makeOrder(11 * MIN);

  await reconcileOrders(deps);

  expect((await deps.db.order.findUniqueOrThrow({ where: { id: fresh.order.id } })).status).toBe(
    'pending',
  );
  expect((await deps.db.order.findUniqueOrThrow({ where: { id: waiting.order.id } })).status).toBe(
    'pending',
  );
  expect(await deps.db.entitlement.count()).toBe(0);
});

it('reconcile and webhook together create one entitlement', async () => {
  const { order, paymentId } = await makeOrder(11 * MIN);
  await fake.setStatus(paymentId, 'paid', new Date(Date.now() - 2 * MIN));

  await Promise.all([
    reconcileOrders(deps),
    applyPayment(deps.db, fake, paymentId, { kind: 'webhook', eventKey: 'fake:ev-1' }),
    reconcileOrders(deps),
  ]);

  expect(await deps.db.entitlement.count({ where: { orderId: order.id } })).toBe(1);
  expect((await deps.db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('paid');
});

it('reconcile grant sends payment_paid mail', async () => {
  const { order, paymentId } = await makeOrder(11 * MIN);
  await fake.setStatus(paymentId, 'paid', new Date(Date.now() - 2 * MIN));

  await reconcileOrders(deps);

  const [mail] = await waitForMail(order.checkoutEmail);
  expect(mail?.subject).toMatch(/^Оплата прошла, доступ до \d{1,2} [а-я]+ \d{4}$/);
  expect(
    await deps.db.notificationLog.findMany({ where: { to: order.checkoutEmail } }),
  ).toMatchObject([
    { template: 'payment_paid', status: 'sent', dedupeKey: `payment_paid:${order.id}` },
  ]);
});

it('expireOrders grant sends payment_paid mail', async () => {
  const { order, paymentId } = await makeOrder(25 * HOUR);
  await fake.setStatus(paymentId, 'paid', new Date(Date.now() - 3 * HOUR));

  await expireOrders(deps);

  expect(await waitForMail(order.checkoutEmail)).toHaveLength(1);
});

it('webhook and reconcile together send one payment_paid mail', async () => {
  const { order, paymentId } = await makeOrder(11 * MIN);
  await fake.setStatus(paymentId, 'paid', new Date(Date.now() - 2 * MIN));
  // The API webhook path: apply, then the same `sendPaymentPaid` on a grant.
  const webhook = async () => {
    const res = await applyPayment(deps.db, fake, paymentId, { kind: 'webhook', eventKey: 'ev' });
    if (res.result === 'granted') await sendPaymentPaid(deps.mail, order.id);
  };

  await Promise.all([reconcileOrders(deps), webhook(), reconcileOrders(deps)]);
  // Even a second grant notice for the same order sends nothing.
  expect(await sendPaymentPaid(deps.mail, order.id)).toBe('duplicate');

  await waitForMail(order.checkoutEmail);
  await new Promise((r) => setTimeout(r, 300));
  expect(await mailpitMessages(order.checkoutEmail)).toHaveLength(1);
  expect(await deps.db.notificationLog.count({ where: { to: order.checkoutEmail } })).toBe(1);
});

it('a failed mail does not fail reconcile', async () => {
  const down = createWorkerDeps(env({ SMTP_URL: 'smtp://127.0.0.1:1' }), pino({ level: 'silent' }));
  try {
    const { order, paymentId } = await makeOrder(11 * MIN);
    await fake.setStatus(paymentId, 'paid', new Date(Date.now() - 2 * MIN));

    const outcome = await reconcileOrders(down);

    expect(outcome).toMatchObject({ granted: 1, errors: 0 });
    expect((await deps.db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'paid',
    );
    expect(
      await deps.db.notificationLog.findMany({ where: { to: order.checkoutEmail } }),
    ).toMatchObject([{ status: 'failed' }]);
  } finally {
    await closeWorkerDeps(down);
  }
});

it('order older than 24h with provider failed becomes expired', async () => {
  const { order, paymentId } = await makeOrder(25 * HOUR);
  await fake.setStatus(paymentId, 'failed');

  await expireOrders(deps);

  expect((await deps.db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
    'expired',
  );
});

it('order older than 24h still pending at provider stays pending', async () => {
  const { order } = await makeOrder(25 * HOUR);

  await expireOrders(deps);

  expect((await deps.db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
    'pending',
  );
});

it('order older than 24h paid at provider is granted, not expired', async () => {
  const { order, paymentId } = await makeOrder(25 * HOUR);
  await fake.setStatus(paymentId, 'paid', new Date(Date.now() - 3 * HOUR));

  await expireOrders(deps);

  expect((await deps.db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('paid');
  expect(await deps.db.entitlement.count({ where: { orderId: order.id } })).toBe(1);
});

it('created order without a payment expires after 24h without the provider', async () => {
  const old = await makeOrder(25 * HOUR, { status: 'created', payment: false });
  const fresh = await makeOrder(2 * HOUR, { status: 'created', payment: false });

  await expireOrders(deps);

  expect((await deps.db.order.findUniqueOrThrow({ where: { id: old.order.id } })).status).toBe(
    'expired',
  );
  expect((await deps.db.order.findUniqueOrThrow({ where: { id: fresh.order.id } })).status).toBe(
    'created',
  );
});

it('with platega the jobs do nothing', async () => {
  const platega = createWorkerDeps(env({ PAYMENT_PROVIDER: 'platega' }), pino({ level: 'silent' }));
  try {
    const { order, paymentId } = await makeOrder(25 * HOUR);
    await fake.setStatus(paymentId, 'paid');
    await reconcileOrders(platega);
    await expireOrders(platega);
    expect((await deps.db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'pending',
    );
  } finally {
    await closeWorkerDeps(platega);
  }
});

it('schedules reconcile every 5 minutes and expireOrders every 15 minutes', async () => {
  await scheduleBillingJobs(deps.queues[QueueName.billing]);
  await scheduleBillingJobs(deps.queues[QueueName.billing]);

  const schedulers = await deps.queues[QueueName.billing].getJobSchedulers();
  const byName = Object.fromEntries(schedulers.map((s) => [s.name, s.every]));
  expect(byName).toEqual({ 'billing:reconcile': 5 * MIN, 'billing:expireOrders': 15 * MIN });
});
