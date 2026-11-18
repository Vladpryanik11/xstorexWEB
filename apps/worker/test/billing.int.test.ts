import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFakeProvider, type FakeProvider } from '@xstore/billing';
import { resetDatabase } from '@xstore/db/testing';
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
    data: { isProvisional: true, checkoutEmail: `b${n}@example.ru` },
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
      checkoutEmail: `b${n}@example.ru`,
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
  const { applyPayment } = await import('@xstore/billing');

  await Promise.all([
    reconcileOrders(deps),
    applyPayment(deps.db, fake, paymentId, { kind: 'webhook', eventKey: 'fake:ev-1' }),
    reconcileOrders(deps),
  ]);

  expect(await deps.db.entitlement.count({ where: { orderId: order.id } })).toBe(1);
  expect((await deps.db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('paid');
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
