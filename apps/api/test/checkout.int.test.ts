import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashToken } from '../src/auth/session.service.js';
import { loadConfig } from '../src/config/config.js';
import {
  checkoutBody,
  PRICE,
  postCheckout,
  SITE,
  seedPlan,
  setCookieOf,
} from './helpers/billing.js';
import { testEnv } from './test-env.js';

// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const dbUrl = process.env.DATABASE_URL_TEST!;
// biome-ignore lint/style/noNonNullAssertion: checked by the env file or CI
const redisUrl = process.env.REDIS_URL_TEST!;

const db = createPrismaClient(dbUrl);
const redis = new Redis(redisUrl);
let app: INestApplication;

const DAY_MS = 24 * 60 * 60 * 1000;
const tokenOf = (res: { headers: Record<string, unknown> }) =>
  /^xs_session=([^;]+)/.exec(setCookieOf(res))?.[1];

beforeAll(async () => {
  app = await createApp(loadConfig(testEnv({ SITE_URL: SITE })));
});

beforeEach(async () => {
  await resetDatabase(dbUrl);
  await redis.flushdb();
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
  redis.disconnect();
});

it('GET /billing/plan returns the active plan or PLAN_UNAVAILABLE', async () => {
  const none = await request(app.getHttpServer()).get('/api/v1/billing/plan');
  expect(none.status).toBe(404);
  expect(none.body.code).toBe('PLAN_UNAVAILABLE');
  await seedPlan(db);
  const res = await request(app.getHttpServer()).get('/api/v1/billing/plan');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    code: 'month',
    title: 'Подписка на месяц',
    durationDays: 30,
    priceRub: PRICE,
  });
  const checkout = await postCheckout(request(app.getHttpServer()), checkoutBody(randomUUID()));
  expect(checkout.status).toBe(200);
  await db.plan.updateMany({ data: { active: false } });
  const off = await postCheckout(request(app.getHttpServer()), checkoutBody(randomUUID()));
  expect(off.status).toBe(404);
  expect(off.body.code).toBe('PLAN_UNAVAILABLE');
});

it('guest checkout creates provisional user, order and session cookie', async () => {
  const plan = await seedPlan(db);
  const key = randomUUID();
  const res = await postCheckout(
    request(app.getHttpServer()),
    checkoutBody(key, { email: '  Buyer@Example.RU ', amountRub: 1, returnTo: '/app/telegram' }),
  );
  expect(res.status).toBe(200);
  const order = await db.order.findFirstOrThrow({ include: { user: true } });
  expect(res.body).toEqual({
    orderId: order.id,
    redirectUrl: `${SITE}/dev/pay/${order.providerPaymentId}`,
  });
  expect(setCookieOf(res)).toMatch(/^xs_session=.+; Path=\/; .*HttpOnly.*SameSite=Lax/);

  expect(order.user).toMatchObject({
    isProvisional: true,
    email: null,
    checkoutEmail: 'buyer@example.ru',
    role: 'user',
    passwordHash: null,
  });
  expect(order).toMatchObject({
    planId: plan.id,
    planSnapshot: { code: 'month', title: 'Подписка на месяц', durationDays: 30, priceRub: PRICE },
    checkoutEmail: 'buyer@example.ru',
    checkoutKey: key,
    returnTo: '/app/telegram',
    amountRub: PRICE,
    status: 'pending',
    provider: 'fake',
    paidAt: null,
  });
  expect(order.expiresAt.getTime() - order.createdAt.getTime()).toBe(DAY_MS);
  const subscription = await db.subscription.findUniqueOrThrow({
    where: { id: order.subscriptionId },
  });
  expect(subscription).toMatchObject({ userId: order.userId, deviceId: null });

  const token = tokenOf(res);
  expect(token).toBeDefined();
  const session = await db.session.findUniqueOrThrow({ where: { id: hashToken(token ?? '') } });
  expect(session).toMatchObject({ userId: order.userId, kind: 'user' });
  const ttlDays = (session.expiresAt.getTime() - Date.now()) / DAY_MS;
  expect(Math.round(ttlDays)).toBe(30);

  const view = await request(app.getHttpServer())
    .get(`/api/v1/billing/orders/${order.id}`)
    .set('Cookie', `xs_session=${token}`);
  expect(view.status).toBe(200);
  expect(view.body).toEqual({
    id: order.id,
    status: 'pending',
    amountRub: PRICE,
    paidAt: null,
    returnTo: '/app/telegram',
    accessUntil: null,
    // The payment page saved at checkout: the wizard links back to it while the order is open.
    paymentUrl: order.redirectUrl,
    accessReady: false,
  });
  expect(order.redirectUrl).toMatch(/\/dev\/pay\//);

  // An order whose 24 hours have passed is no longer payable, even before reconciliation.
  await db.order.update({ where: { id: order.id }, data: { expiresAt: new Date(Date.now() - 1) } });
  const stale = await request(app.getHttpServer())
    .get(`/api/v1/billing/orders/${order.id}`)
    .set('Cookie', `xs_session=${token}`);
  expect(stale.body.paymentUrl).toBeNull();
  await db.order.update({ where: { id: order.id }, data: { status: 'expired' } });
  const expired = await request(app.getHttpServer())
    .get(`/api/v1/billing/orders/${order.id}`)
    .set('Cookie', `xs_session=${token}`);
  expect(expired.body).toMatchObject({ status: 'expired', paymentUrl: null });
});

it('checkout requires terms, a valid key and the site origin', async () => {
  await seedPlan(db);
  const server = request(app.getHttpServer());
  const noTerms = await postCheckout(server, checkoutBody(randomUUID(), { acceptTerms: false }));
  expect(noTerms.status).toBe(400);
  const badKey = await postCheckout(server, checkoutBody('not-a-uuid'));
  expect(badKey.status).toBe(400);
  const foreign = await server
    .post('/api/v1/billing/checkout')
    .set('Origin', 'https://evil.example')
    .send(checkoutBody(randomUUID()));
  expect(foreign.status).toBe(403);
  expect(await db.order.count()).toBe(0);
  expect(await db.user.count()).toBe(0);
});

it('concurrent guest checkout creates one order', async () => {
  await seedPlan(db);
  const body = checkoutBody(randomUUID());
  const results = await Promise.all([
    postCheckout(request(app.getHttpServer()), body),
    postCheckout(request(app.getHttpServer()), body),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const conflict = results.find((r) => r.status === 409);
  expect(conflict?.body.code).toBe('CHECKOUT_IN_PROGRESS');
  expect(setCookieOf(conflict ?? { headers: {} })).toBe('');
  expect(await db.order.count()).toBe(1);
  expect(await db.user.count()).toBe(1);
  expect(await db.session.count()).toBe(1);
});

it('checkout email is not a credential', async () => {
  await seedPlan(db);
  const owner = await db.user.create({ data: { email: 'owner@example.ru' } });
  const res = await postCheckout(
    request(app.getHttpServer()),
    checkoutBody(randomUUID(), { email: 'Owner@Example.ru' }),
  );
  expect(res.status).toBe(200);
  const order = await db.order.findFirstOrThrow();
  expect(order.userId).not.toBe(owner.id);
  expect(await db.session.count({ where: { userId: owner.id } })).toBe(0);
  expect(await db.subscription.count({ where: { userId: owner.id } })).toBe(0);
  const buyer = await db.user.findUniqueOrThrow({ where: { id: order.userId } });
  expect(buyer).toMatchObject({
    isProvisional: true,
    email: null,
    checkoutEmail: 'owner@example.ru',
  });
  const session = await db.session.findUniqueOrThrow({
    where: { id: hashToken(tokenOf(res) ?? '') },
  });
  expect(session.userId).toBe(buyer.id);
});

it('pending order is reused instead of new payment', async () => {
  await seedPlan(db);
  const agent = request.agent(app.getHttpServer());
  const key = randomUUID();
  const first = await postCheckout(agent, checkoutBody(key));
  expect(first.status).toBe(200);
  // Same key and same session: the same order.
  const again = await postCheckout(agent, checkoutBody(key));
  expect(again.status).toBe(200);
  expect(again.body).toEqual(first.body);
  // A new key while the payment is unresolved: still the same order and payment.
  const other = await postCheckout(agent, checkoutBody(randomUUID(), { email: 'x@example.ru' }));
  expect(other.status).toBe(200);
  expect(other.body).toEqual(first.body);
  expect(await db.order.count()).toBe(1);
  expect(await db.user.count()).toBe(1);
  expect(await db.subscription.count()).toBe(1);
  const payments = (await redis.keys('xs:fakepay:*')).filter((k) => !k.includes(':idem:'));
  expect(payments).toHaveLength(1);
});

it('signed-in buyer renews the same subscription after a failed payment', async () => {
  await seedPlan(db);
  const agent = request.agent(app.getHttpServer());
  const first = await postCheckout(agent, checkoutBody(randomUUID()));
  await db.order.update({ where: { id: first.body.orderId }, data: { status: 'failed' } });
  const second = await postCheckout(agent, checkoutBody(randomUUID()));
  expect(second.status).toBe(200);
  expect(second.body.orderId).not.toBe(first.body.orderId);
  const orders = await db.order.findMany();
  expect(orders).toHaveLength(2);
  expect(new Set(orders.map((o) => o.subscriptionId)).size).toBe(1);
  expect(new Set(orders.map((o) => o.userId)).size).toBe(1);
  expect(await db.user.count()).toBe(1);
});

it('foreign order id returns 404', async () => {
  await seedPlan(db);
  const a = request.agent(app.getHttpServer());
  const b = request.agent(app.getHttpServer());
  const orderA = await postCheckout(a, checkoutBody(randomUUID()));
  await postCheckout(b, checkoutBody(randomUUID()));
  const own = await a.get(`/api/v1/billing/orders/${orderA.body.orderId}`);
  expect(own.status).toBe(200);
  expect(own.body.paymentUrl).toBe(orderA.body.redirectUrl);
  const foreign = await b.get(`/api/v1/billing/orders/${orderA.body.orderId}`);
  expect(foreign.status).toBe(404);
  expect(foreign.body).not.toHaveProperty('paymentUrl');
  expect(foreign.body.code).toBe('NOT_FOUND');
  const anonymous = await request(app.getHttpServer()).get(
    `/api/v1/billing/orders/${orderA.body.orderId}`,
  );
  expect(anonymous.status).toBe(404);
  const missing = await a.get('/api/v1/billing/orders/nope');
  expect(missing.status).toBe(404);
});

it('returnTo outside site is dropped', async () => {
  await seedPlan(db);
  for (const returnTo of ['https://evil.example/x', '//evil.example', '/%2F%2Fevil.example']) {
    await resetDatabase(dbUrl);
    await seedPlan(db);
    const res = await postCheckout(
      request(app.getHttpServer()),
      checkoutBody(randomUUID(), { returnTo }),
    );
    expect(res.status).toBe(200);
    const order = await db.order.findFirstOrThrow();
    expect(order.returnTo).toBeNull();
  }
});

it('a key of a settled order answers CHECKOUT_SETTLED, a new key starts a new order', async () => {
  await seedPlan(db);
  const agent = request.agent(app.getHttpServer());
  for (const status of ['paid', 'failed', 'expired', 'refunded'] as const) {
    await redis.flushdb(); // checkout rate limit
    const key = randomUUID();
    const first = await postCheckout(agent, checkoutBody(key));
    expect(first.status).toBe(200);
    await db.order.update({ where: { id: first.body.orderId }, data: { status } });
    const again = await postCheckout(agent, checkoutBody(key));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('CHECKOUT_SETTLED');
    // Without the buyer's session too: a settled order is never continued.
    const stranger = await postCheckout(request(app.getHttpServer()), checkoutBody(key));
    expect(stranger.status).toBe(409);
    expect(stranger.body.code).toBe('CHECKOUT_SETTLED');
  }
  const fresh = await postCheckout(agent, checkoutBody(randomUUID()));
  expect(fresh.status).toBe(200);
  expect(await db.order.count()).toBe(5);
});
