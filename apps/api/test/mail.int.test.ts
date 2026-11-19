import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createFakeProvider, fakeWebhookSignature } from '@xstore/billing';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { mailpitMessages, waitForMail } from '@xstore/mail/testing';
import { formatRuDate } from '@xstore/shared';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/config.js';
import { MailService } from '../src/mail/mail.service.js';
import { checkoutBody, postCheckout, SITE, seedPlan } from './helpers/billing.js';
import { TEST_WEBHOOK_SECRET, testEnv } from './test-env.js';

// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const dbUrl = process.env.DATABASE_URL_TEST!;
// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const redisUrl = process.env.REDIS_URL_TEST!;

const db = createPrismaClient(dbUrl);
const redis = new Redis(redisUrl);
const fake = createFakeProvider(redis, { siteUrl: SITE, webhookSecret: TEST_WEBHOOK_SECRET });
const DAY_MS = 24 * 60 * 60 * 1000;
let app: INestApplication;
let devApp: INestApplication;
let downApp: INestApplication;

beforeAll(async () => {
  app = await createApp(loadConfig(testEnv({ SITE_URL: SITE })));
  devApp = await createApp(loadConfig(testEnv({ SITE_URL: SITE, XSTORE_DEV_PAGES: '1' })));
  // Nothing listens on port 1: every send fails.
  downApp = await createApp(
    loadConfig(testEnv({ SITE_URL: SITE, SMTP_URL: 'smtp://127.0.0.1:1' })),
  );
});

beforeEach(async () => {
  await resetDatabase(dbUrl);
  await redis.flushdb();
  await seedPlan(db);
});

afterAll(async () => {
  await app.close();
  await devApp.close();
  await downApp.close();
  await db.$disconnect();
  redis.disconnect();
});

/** A unique recipient per test: Mailpit is shared and never cleared. */
const rcpt = () => `api-${randomUUID()}@example.ru`;

async function buy(target: INestApplication, email: string) {
  const agent = request.agent(target.getHttpServer());
  const res = await postCheckout(agent, checkoutBody(randomUUID(), { email }));
  expect(res.status).toBe(200);
  const order = await db.order.findUniqueOrThrow({ where: { id: res.body.orderId } });
  return { agent, order, paymentId: order.providerPaymentId ?? '' };
}

function sendWebhook(target: INestApplication, paymentId: string, eventId: string) {
  const raw = Buffer.from(JSON.stringify({ paymentId, eventId }));
  return request(target.getHttpServer())
    .post('/api/v1/billing/webhooks/fake')
    .set('content-type', 'application/json')
    .set('x-fake-signature', fakeWebhookSignature(TEST_WEBHOOK_SECRET, raw))
    .send(raw.toString('utf8'));
}

it('payment webhook sends payment_paid mail', async () => {
  const to = rcpt();
  const { agent, order, paymentId } = await buy(app, to);
  const paidAt = new Date(Date.now() - 60_000);
  await fake.setStatus(paymentId, 'paid', paidAt);

  expect((await sendWebhook(app, paymentId, 'ev-1')).status).toBe(204);
  // Replays and the browser return do not send it again.
  expect((await sendWebhook(app, paymentId, 'ev-1')).status).toBe(204);
  expect((await sendWebhook(app, paymentId, 'ev-2')).status).toBe(204);
  expect((await agent.get(`/api/v1/billing/orders/${order.id}`)).body.status).toBe('paid');

  const until = new Date(paidAt.getTime() + 30 * DAY_MS);
  const [mail] = await waitForMail(to);
  expect(mail?.subject).toBe(`Оплата прошла, доступ до ${formatRuDate(until)}`);
  expect(mail?.text).toContain(formatRuDate(until));
  expect(mail?.text).toContain(SITE);
  expect(await mailpitMessages(to)).toHaveLength(1);
  expect(await db.notificationLog.findMany({ where: { to } })).toMatchObject([
    { template: 'payment_paid', status: 'sent', dedupeKey: `payment_paid:${order.id}` },
  ]);
});

it('dev fake payment sends payment_paid mail', async () => {
  const to = rcpt();
  const { order, paymentId } = await buy(devApp, to);
  const pay = await request(devApp.getHttpServer())
    .post(`/api/v1/billing/dev/fake-payments/${paymentId}/pay`)
    .set('Origin', SITE);
  expect(pay.body).toEqual({ result: 'granted', orderId: order.id });
  const [mail] = await waitForMail(to);
  expect(mail?.subject).toMatch(/^Оплата прошла, доступ до /);
});

it('a failed send does not fail the webhook', async () => {
  const to = rcpt();
  const { agent, order, paymentId } = await buy(downApp, to);
  await fake.setStatus(paymentId, 'paid', new Date(Date.now() - 60_000));

  expect((await sendWebhook(downApp, paymentId, 'ev-1')).status).toBe(204);

  expect((await agent.get('/api/v1/access')).body.state.kind).toBe('active');
  expect(await db.notificationLog.findMany({ where: { to } })).toMatchObject([
    { template: 'payment_paid', status: 'failed', dedupeKey: `payment_paid:${order.id}` },
  ]);
  expect(await mailpitMessages(to)).toHaveLength(0);
});

it('NotificationLog never stores the code', async () => {
  const to = rcpt();
  const code = '604918';
  await app.get(MailService).send('login_code', to, { code });

  const [mail] = await waitForMail(to);
  expect(mail?.subject).toBe('Код для входа');
  expect(mail?.text).toContain(`Ваш код: ${code}. Он действует 10 минут`);
  const rows = await db.notificationLog.findMany({ where: { to } });
  expect(rows).toMatchObject([{ template: 'login_code', status: 'sent' }]);
  expect(JSON.stringify(rows)).not.toContain(code);

  // A failed send is not thrown either, and its log row has no code.
  const down = rcpt();
  await downApp.get(MailService).send('login_code', down, { code });
  const failed = await db.notificationLog.findMany({ where: { to: down } });
  expect(failed).toMatchObject([{ template: 'login_code', status: 'failed' }]);
  expect(JSON.stringify(failed)).not.toContain(code);
});
