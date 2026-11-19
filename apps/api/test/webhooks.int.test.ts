import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createFakeProvider, fakeWebhookSignature } from '@xstore/billing';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { SessionService } from '../src/auth/session.service.js';
import { loadConfig } from '../src/config/config.js';
import {
  checkoutBody,
  cookieExpiry,
  PRICE,
  postCheckout,
  SITE,
  seedPlan,
} from './helpers/billing.js';
import { TEST_WEBHOOK_SECRET, testEnv } from './test-env.js';

// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const dbUrl = process.env.DATABASE_URL_TEST!;
// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const redisUrl = process.env.REDIS_URL_TEST!;

const db = createPrismaClient(dbUrl);
const redis = new Redis(redisUrl);
const fake = createFakeProvider(redis, { siteUrl: SITE, webhookSecret: TEST_WEBHOOK_SECRET });
let app: INestApplication;
let devApp: INestApplication;

const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  app = await createApp(loadConfig(testEnv({ SITE_URL: SITE })));
  devApp = await createApp(loadConfig(testEnv({ SITE_URL: SITE, XSTORE_DEV_PAGES: '1' })));
});

beforeEach(async () => {
  await resetDatabase(dbUrl);
  await redis.flushdb();
  await seedPlan(db);
});

afterAll(async () => {
  await app.close();
  await devApp.close();
  await db.$disconnect();
  redis.disconnect();
});

/** Guest checkout; returns the agent holding the buyer's cookie and the order. */
async function buy(target: INestApplication = app) {
  const agent = request.agent(target.getHttpServer());
  const res = await postCheckout(agent, checkoutBody(randomUUID()));
  expect(res.status).toBe(200);
  const order = await db.order.findUniqueOrThrow({ where: { id: res.body.orderId } });
  return { agent, order, paymentId: order.providerPaymentId ?? '' };
}

function sendWebhook(paymentId: string, eventId: string, secret = TEST_WEBHOOK_SECRET) {
  const raw = Buffer.from(JSON.stringify({ paymentId, eventId }));
  return request(app.getHttpServer())
    .post('/api/v1/billing/webhooks/fake')
    .set('content-type', 'application/json')
    .set('x-fake-signature', fakeWebhookSignature(secret, raw))
    .send(raw.toString('utf8'));
}

it('GET /access without a session is none', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/access');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ state: { kind: 'none' } });
});

it('webhook paid grants access visible in GET /access', async () => {
  const { agent, order, paymentId } = await buy();
  const pending = await agent.get('/api/v1/access');
  expect(pending.body).toEqual({
    state: { kind: 'payment_pending', orderId: order.id },
    email: 'buyer@example.ru',
    hasPassword: false,
  });

  const paidAt = new Date(Date.now() - 60_000);
  await fake.setStatus(paymentId, 'paid', paidAt);
  const hook = await sendWebhook(paymentId, 'ev-1');
  expect(hook.status).toBe(204);

  const until = new Date(paidAt.getTime() + 30 * DAY_MS);
  const access = await agent.get('/api/v1/access');
  expect(access.status).toBe(200);
  expect(access.body).toEqual({
    state: {
      kind: 'active',
      until: until.toISOString(),
      subscriptionId: order.subscriptionId,
      device: null,
    },
    email: 'buyer@example.ru',
    hasPassword: false,
  });
  const view = await agent.get(`/api/v1/billing/orders/${order.id}`);
  expect(view.body).toMatchObject({
    status: 'paid',
    amountRub: PRICE,
    paidAt: paidAt.toISOString(),
    accessUntil: until.toISOString(),
    paymentUrl: null,
  });
  const events = await db.paymentEvent.findMany();
  expect(events).toMatchObject([{ provider: 'fake', eventKey: 'fake:ev-1', result: 'granted' }]);
});

it('replayed webhook keeps dates', async () => {
  const { paymentId } = await buy();
  await fake.setStatus(paymentId, 'paid', new Date(Date.now() - 60_000));
  expect((await sendWebhook(paymentId, 'ev-1')).status).toBe(204);
  const before = await db.entitlement.findMany();
  expect(before).toHaveLength(1);
  expect((await sendWebhook(paymentId, 'ev-1')).status).toBe(204);
  expect((await sendWebhook(paymentId, 'ev-2')).status).toBe(204);
  const after = await db.entitlement.findMany();
  expect(after).toEqual(before);
  const order = await db.order.findFirstOrThrow();
  expect(order.status).toBe('paid');
});

it('bad signature returns 401 and writes nothing', async () => {
  const { order, paymentId } = await buy();
  await fake.setStatus(paymentId, 'paid', new Date());
  const bad = await sendWebhook(paymentId, 'ev-1', 'wrong-secret-0000');
  expect(bad.status).toBe(401);
  expect(bad.body.code).toBe('UNAUTHORIZED');
  const unsigned = await request(app.getHttpServer())
    .post('/api/v1/billing/webhooks/fake')
    .set('content-type', 'application/json')
    .send(JSON.stringify({ paymentId, eventId: 'ev-2' }));
  expect(unsigned.status).toBe(401);
  const otherProvider = await request(app.getHttpServer())
    .post('/api/v1/billing/webhooks/platega')
    .set('content-type', 'application/json')
    .send('{}');
  expect(otherProvider.status).toBe(404);
  const huge = await request(app.getHttpServer())
    .post('/api/v1/billing/webhooks/fake')
    .set('content-type', 'application/json')
    .send(JSON.stringify({ pad: 'x'.repeat(70 * 1024) }));
  expect(huge.status).toBe(413);
  expect(await db.entitlement.count()).toBe(0);
  expect(await db.paymentEvent.count()).toBe(0);
  expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('pending');
});

it('session expiry extends to access end plus 7 days after payment', async () => {
  const { agent, paymentId } = await buy();
  const paidAt = new Date(Date.now() - 60_000);
  await fake.setStatus(paymentId, 'paid', paidAt);
  expect((await sendWebhook(paymentId, 'ev-1')).status).toBe(204);
  // Another month on top: the session follows the end of all paid access.
  const renewal = await postCheckout(agent, checkoutBody(randomUUID()));
  expect(renewal.status).toBe(200);
  const second = await db.order.findUniqueOrThrow({ where: { id: renewal.body.orderId } });
  await fake.setStatus(second.providerPaymentId ?? '', 'paid', new Date());
  expect((await sendWebhook(second.providerPaymentId ?? '', 'ev-2')).status).toBe(204);

  const until = new Date(paidAt.getTime() + 60 * DAY_MS);
  const expected = until.getTime() + 7 * DAY_MS;
  const session = await db.session.findFirstOrThrow();
  expect(session.expiresAt.getTime()).toBe(expected);
  const res = await agent.get('/api/v1/access');
  expect(res.body.state.until).toBe(until.toISOString());
  // Cookie Expires has second precision.
  expect(Math.abs((cookieExpiry(res)?.getTime() ?? 0) - expected)).toBeLessThan(1000);
});

it('order page re-checks the provider before the webhook arrives', async () => {
  const { agent, order, paymentId } = await buy();
  await fake.setStatus(paymentId, 'paid', new Date(Date.now() - 1000));
  const view = await agent.get(`/api/v1/billing/orders/${order.id}`);
  expect(view.status).toBe(200);
  expect(view.body.status).toBe('paid');
  expect(await db.entitlement.count()).toBe(1);
});

it('dev fake payment routes exist only with dev pages', async () => {
  const { paymentId } = await buy();
  const off = await request(app.getHttpServer())
    .post(`/api/v1/billing/dev/fake-payments/${paymentId}/pay`)
    .set('Origin', SITE);
  expect(off.status).toBe(404);
  expect(await db.entitlement.count()).toBe(0);

  const dev = await buy(devApp);
  const pay = await request(devApp.getHttpServer())
    .post(`/api/v1/billing/dev/fake-payments/${dev.paymentId}/pay`)
    .set('Origin', SITE);
  expect(pay.status).toBe(200);
  expect(pay.body).toEqual({ result: 'granted', orderId: dev.order.id });
  const access = await dev.agent.get('/api/v1/access');
  expect(access.body.state.kind).toBe('active');

  const other = await buy(devApp);
  const fail = await request(devApp.getHttpServer())
    .post(`/api/v1/billing/dev/fake-payments/${other.paymentId}/fail`)
    .set('Origin', SITE);
  expect(fail.status).toBe(200);
  expect(fail.body).toEqual({ result: 'failed', orderId: other.order.id });
  expect((await db.order.findUniqueOrThrow({ where: { id: other.order.id } })).status).toBe(
    'failed',
  );
  const failedView = await other.agent.get(`/api/v1/billing/orders/${other.order.id}`);
  expect(failedView.body).toMatchObject({ status: 'failed', paymentUrl: null });
  const unknown = await request(devApp.getHttpServer())
    .post('/api/v1/billing/dev/fake-payments/nope/pay')
    .set('Origin', SITE);
  expect(unknown.status).toBe(404);
});

it('session renewal on a visit follows paid access', async () => {
  const { agent, paymentId } = await buy();
  const paidAt = new Date(Date.now() - 60_000);
  await fake.setStatus(paymentId, 'paid', paidAt);
  expect((await sendWebhook(paymentId, 'ev-1')).status).toBe(204);
  // Close to its end, the session renews to the end of access plus 7 days, not to now + 30.
  await db.session.updateMany({ data: { expiresAt: new Date(Date.now() + DAY_MS) } });
  const res = await agent.get('/api/v1/access');
  expect(res.body.state.kind).toBe('active');
  const expected = paidAt.getTime() + 37 * DAY_MS;
  expect((await db.session.findFirstOrThrow()).expiresAt.getTime()).toBe(expected);
  expect(Math.abs((cookieExpiry(res)?.getTime() ?? 0) - expected)).toBeLessThan(1000);
});

/** A verified buyer with two subscriptions, as after `claimProvisional`: an old one whose right
 * ended long ago, then a claimed one with a live right. */
async function buyerWithClaimedSubscription() {
  const user = await db.user.create({ data: { email: 'two@example.ru', role: 'user' } });
  const s1 = await db.subscription.create({
    data: { userId: user.id, createdAt: new Date(Date.now() - 120 * DAY_MS) },
  });
  await db.entitlement.create({
    data: {
      subscriptionId: s1.id,
      planCode: 'manual',
      durationDays: 30,
      startsAt: new Date(Date.now() - 100 * DAY_MS),
      expiresAt: new Date(Date.now() - 70 * DAY_MS),
    },
  });
  const s2 = await db.subscription.create({ data: { userId: user.id } });
  const live = await db.entitlement.create({
    data: {
      subscriptionId: s2.id,
      planCode: 'manual',
      durationDays: 30,
      startsAt: new Date(Date.now() - 5 * DAY_MS),
      expiresAt: new Date(Date.now() + 25 * DAY_MS),
    },
  });
  const { token } = await app.get(SessionService).create(user.id, 'user', {});
  return { user, s1, s2, live, cookie: `xs_session=${token}` };
}

const checkoutAs = (cookie: string) =>
  request(app.getHttpServer())
    .post('/api/v1/billing/checkout')
    .set('Origin', SITE)
    .set('Cookie', cookie)
    .send(checkoutBody(randomUUID()));

it('renewal goes to the live claimed subscription and chains after its end', async () => {
  const { s2, live, cookie } = await buyerWithClaimedSubscription();
  const res = await checkoutAs(cookie);
  expect(res.status).toBe(200);
  const order = await db.order.findUniqueOrThrow({ where: { id: res.body.orderId } });
  expect(order.subscriptionId).toBe(s2.id);

  await fake.setStatus(order.providerPaymentId ?? '', 'paid', new Date());
  expect((await sendWebhook(order.providerPaymentId ?? '', 'ev-renew')).status).toBe(204);
  const right = await db.entitlement.findUniqueOrThrow({ where: { orderId: order.id } });
  expect(right.subscriptionId).toBe(s2.id);
  expect(right.startsAt).toEqual(live.expiresAt);

  const access = await request(app.getHttpServer()).get('/api/v1/access').set('Cookie', cookie);
  expect(access.body.state).toMatchObject({
    kind: 'active',
    subscriptionId: s2.id,
    until: right.expiresAt.toISOString(),
  });
});

it("order page shows the buyer's overall access end, like /access", async () => {
  const { s1, cookie } = await buyerWithClaimedSubscription();
  // A paid order on the old subscription: its own right ended, the claimed one is live.
  const plan = await db.plan.findFirstOrThrow();
  const old = await db.order.create({
    data: {
      userId: s1.userId,
      subscriptionId: s1.id,
      planId: plan.id,
      planSnapshot: {
        code: 'month',
        title: 'Подписка на месяц',
        durationDays: 30,
        priceRub: PRICE,
      },
      checkoutEmail: 'two@example.ru',
      checkoutKey: randomUUID(),
      amountRub: PRICE,
      status: 'paid',
      provider: 'fake',
      paidAt: new Date(Date.now() - 100 * DAY_MS),
      expiresAt: new Date(Date.now() - 99 * DAY_MS),
    },
  });
  const access = await request(app.getHttpServer()).get('/api/v1/access').set('Cookie', cookie);
  const view = await request(app.getHttpServer())
    .get(`/api/v1/billing/orders/${old.id}`)
    .set('Cookie', cookie);
  expect(view.status).toBe(200);
  expect(view.body.accessUntil).toBe(access.body.state.until);
  expect(view.body.accessUntil).not.toBeNull();
});

it('an open order on another subscription blocks a second payment', async () => {
  const { s1, cookie } = await buyerWithClaimedSubscription();
  const plan = await db.plan.findFirstOrThrow();
  const open = await db.order.create({
    data: {
      userId: s1.userId,
      subscriptionId: s1.id,
      planId: plan.id,
      planSnapshot: {
        code: 'month',
        title: 'Подписка на месяц',
        durationDays: 30,
        priceRub: PRICE,
      },
      checkoutEmail: 'two@example.ru',
      checkoutKey: randomUUID(),
      amountRub: PRICE,
      status: 'pending',
      provider: 'fake',
      providerPaymentId: 'fake_open',
      redirectUrl: `${SITE}/dev/pay/fake_open`,
      expiresAt: new Date(Date.now() + DAY_MS),
    },
  });
  const res = await checkoutAs(cookie);
  expect(res.status).toBe(200);
  expect(res.body.orderId).toBe(open.id);
  expect(await db.order.count()).toBe(1);
});
