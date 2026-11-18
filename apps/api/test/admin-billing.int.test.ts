import type { INestApplication } from '@nestjs/common';
import { createPrismaClient } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { SessionService } from '../src/auth/session.service.js';
import { loadConfig } from '../src/config/config.js';
import { PRICE, SITE, seedPlan } from './helpers/billing.js';
import { testEnv } from './test-env.js';

const config = loadConfig(testEnv({ SITE_URL: SITE }));
const db = createPrismaClient(config.databaseUrl);
const redis = new Redis(config.redisUrl);
const DAY_MS = 24 * 60 * 60 * 1000;
let app: INestApplication;
let adminCookie: string;
let supportCookie: string;
let adminId: string;

const as = (cookie: string) => {
  const server = () => request(app.getHttpServer());
  return {
    get: (path: string) => server().get(`/api/v1${path}`).set('Cookie', cookie),
    post: (path: string, body?: object) =>
      server().post(`/api/v1${path}`).set('Origin', SITE).set('Cookie', cookie).send(body),
    patch: (path: string, body: object) =>
      server().patch(`/api/v1${path}`).set('Origin', SITE).set('Cookie', cookie).send(body),
  };
};
const admin = () => as(adminCookie);
const support = () => as(supportCookie);

async function cookieFor(userId: string, kind: 'staff' | 'user'): Promise<string> {
  const { token } = await app.get(SessionService).create(userId, kind, {});
  return `xs_session=${token}`;
}

/** A paid order on `subscriptionId` whose right runs `from`..`from + 30d`. */
async function paidOrder(userId: string, subscriptionId: string, email: string, from: Date) {
  const plan = await db.plan.findFirstOrThrow();
  const order = await db.order.create({
    data: {
      userId,
      subscriptionId,
      planId: plan.id,
      planSnapshot: {
        code: 'month',
        title: 'Подписка на месяц',
        durationDays: 30,
        priceRub: PRICE,
      },
      checkoutEmail: email,
      checkoutKey: crypto.randomUUID(),
      amountRub: PRICE,
      status: 'paid',
      provider: 'fake',
      providerPaymentId: `fake_${crypto.randomUUID()}`,
      paidAt: from,
      expiresAt: new Date(from.getTime() + DAY_MS),
    },
  });
  const entitlement = await db.entitlement.create({
    data: {
      subscriptionId,
      planCode: 'month',
      durationDays: 30,
      startsAt: from,
      expiresAt: new Date(from.getTime() + 30 * DAY_MS),
      orderId: order.id,
    },
  });
  return { order, entitlement };
}

/** A buyer with one subscription and a paid order whose right runs `from`..`from + 30d`. */
async function paidBuyer(email: string, from = new Date()) {
  const user = await db.user.create({ data: { email, role: 'user' } });
  const subscription = await db.subscription.create({ data: { userId: user.id } });
  const { order, entitlement } = await paidOrder(user.id, subscription.id, email, from);
  return { user, subscription, order, entitlement };
}

beforeAll(async () => {
  app = await createApp(config);
});

beforeEach(async () => {
  await resetDatabase(config.databaseUrl);
  await redis.flushdb();
  await seedPlan(db);
  const a = await db.user.create({ data: { email: 'admin@xstorex.ru', role: 'admin' } });
  const s = await db.user.create({ data: { email: 'support@xstorex.ru', role: 'support' } });
  adminId = a.id;
  adminCookie = await cookieFor(a.id, 'staff');
  supportCookie = await cookieFor(s.id, 'staff');
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
  redis.disconnect();
});

describe('plan', () => {
  it('price change keeps paid order snapshot', async () => {
    const { order } = await paidBuyer('old@example.ru');
    const before = await admin().get('/admin/billing/plan');
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({
      title: 'Подписка на месяц',
      priceRub: PRICE,
      active: true,
    });

    const res = await admin().patch('/admin/billing/plan', { priceRub: 499 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ priceRub: 499, durationDays: 30, active: true });
    expect((await request(app.getHttpServer()).get('/api/v1/billing/plan')).body.priceRub).toBe(
      499,
    );

    const kept = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(kept.amountRub).toBe(PRICE);
    expect(kept.planSnapshot).toMatchObject({ priceRub: PRICE });

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'plan.update' } });
    expect(audit).toMatchObject({ actorId: adminId, entity: 'plan' });
    expect(audit.diff).toEqual({ priceRub: { from: PRICE, to: 499 } });
  });

  it('concurrent price changes audit an exact from → to chain', async () => {
    const [a, b] = await Promise.all([
      admin().patch('/admin/billing/plan', { priceRub: 400 }),
      admin().patch('/admin/billing/plan', { priceRub: 500 }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const audits = await db.auditLog.findMany({ where: { action: 'plan.update' } });
    expect(audits).toHaveLength(2);
    // Both writes may land in the same millisecond: order the chain by its prices, not createdAt.
    const changes = audits.map(
      (x) => (x.diff as { priceRub: { from: number; to: number } }).priceRub,
    );
    const first = changes.find((c) => c.from === PRICE);
    const second = changes.find((c) => c !== first);
    expect(first).toBeDefined();
    expect(second?.from).toBe(first?.to);
    expect(new Set([first?.to, second?.to])).toEqual(new Set([400, 500]));
    expect((await db.plan.findFirstOrThrow()).priceRub).toBe(second?.to);
  });

  it('rejects a price that is not a whole positive number', async () => {
    for (const priceRub of [0, -5, 12.5, '300']) {
      const res = await admin().patch('/admin/billing/plan', { priceRub });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    }
    expect((await admin().patch('/admin/billing/plan', {})).status).toBe(400);
  });
});

describe('grants', () => {
  it('grant 30 days creates entitlement with grantedById and audit', async () => {
    const t0 = Date.now();
    const res = await admin().post('/admin/billing/grants', {
      email: '  Tester@Example.RU ',
      days: 30,
      note: 'Тестер',
    });
    expect(res.status).toBe(201);
    const user = await db.user.findUniqueOrThrow({
      where: { email: 'tester@example.ru' },
      include: { subscriptions: { include: { entitlements: true } } },
    });
    expect(user).toMatchObject({ role: 'user', isProvisional: false });
    expect(user.subscriptions).toHaveLength(1);
    const right = user.subscriptions[0]?.entitlements[0];
    expect(right).toMatchObject({
      grantedById: adminId,
      orderId: null,
      durationDays: 30,
      note: 'Тестер',
      revokedAt: null,
    });
    expect(right?.startsAt.getTime()).toBeGreaterThanOrEqual(t0 - 1000);
    expect(right?.expiresAt.getTime()).toBe((right?.startsAt.getTime() ?? 0) + 30 * DAY_MS);
    expect(res.body).toEqual({
      subscriptionId: user.subscriptions[0]?.id,
      startsAt: right?.startsAt.toISOString(),
      expiresAt: right?.expiresAt.toISOString(),
    });

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'grant.create' } });
    expect(audit).toMatchObject({ actorId: adminId, entity: 'entitlement', entityId: right?.id });
    expect(audit.diff).toMatchObject({ email: 'tester@example.ru', days: 30, note: 'Тестер' });

    const buyer = await cookieFor(user.id, 'user');
    const access = await as(buyer).get('/access');
    expect(access.body.state).toMatchObject({
      kind: 'active',
      until: right?.expiresAt.toISOString(),
    });
  });

  it('grant extends after current access end', async () => {
    const { user, subscription, entitlement } = await paidBuyer('buyer@example.ru');
    const res = await admin().post('/admin/billing/grants', {
      email: 'buyer@example.ru',
      days: 10,
      note: 'Компенсация',
    });
    expect(res.status).toBe(201);
    expect(res.body.subscriptionId).toBe(subscription.id);
    expect(res.body.startsAt).toBe(entitlement.expiresAt.toISOString());
    expect(res.body.expiresAt).toBe(
      new Date(entitlement.expiresAt.getTime() + 10 * DAY_MS).toISOString(),
    );
    expect(await db.user.count({ where: { email: 'buyer@example.ru' } })).toBe(1);
    expect(await db.subscription.count({ where: { userId: user.id } })).toBe(1);

    const access = await as(await cookieFor(user.id, 'user')).get('/access');
    expect(access.body.state.until).toBe(res.body.expiresAt);
  });

  it('concurrent grants to one new email create one buyer and chain their periods', async () => {
    const results = await Promise.all(
      [5, 5, 5].map((days) =>
        admin().post('/admin/billing/grants', { email: 'race@example.ru', days }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(await db.user.count({ where: { email: 'race@example.ru' } })).toBe(1);
    expect(await db.subscription.count()).toBe(1);
    const rights = await db.entitlement.findMany({ orderBy: { startsAt: 'asc' } });
    expect(rights).toHaveLength(3);
    expect(rights[1]?.startsAt).toEqual(rights[0]?.expiresAt);
    expect(rights[2]?.startsAt).toEqual(rights[1]?.expiresAt);
  });

  it('refuses a staff email, a blocked buyer and bad days', async () => {
    const staff = await admin().post('/admin/billing/grants', {
      email: 'support@xstorex.ru',
      days: 30,
      note: '',
    });
    expect(staff.status).toBe(409);
    expect(staff.body.code).toBe('GRANT_STAFF_EMAIL');

    await db.user.create({ data: { email: 'blocked@example.ru', blockedAt: new Date() } });
    const blocked = await admin().post('/admin/billing/grants', {
      email: 'blocked@example.ru',
      days: 30,
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('ACCOUNT_BLOCKED');

    for (const days of [0, 366, 1.5]) {
      const res = await admin().post('/admin/billing/grants', { email: 'x@example.ru', days });
      expect(res.status).toBe(400);
    }
    expect(await db.entitlement.count()).toBe(0);
  });

  it('a provisional row never holds an email, so only staff get GRANT_STAFF_EMAIL', async () => {
    // The User CHECK keeps provisional buyers at `email = null`; the service still answers
    // CONFLICT (never GRANT_STAFF_EMAIL) should such a row appear.
    await expect(
      db.user.create({
        data: { email: 'odd@example.ru', isProvisional: true, checkoutEmail: 'odd@example.ru' },
      }),
    ).rejects.toThrow();
    await db.user.create({ data: { isProvisional: true, checkoutEmail: 'odd@example.ru' } });
    const res = await admin().post('/admin/billing/grants', { email: 'odd@example.ru', days: 7 });
    expect(res.status).toBe(201);
  });

  it('does not touch a provisional buyer with the same contact email', async () => {
    const provisional = await db.user.create({
      data: { isProvisional: true, checkoutEmail: 'guest@example.ru' },
    });
    const res = await admin().post('/admin/billing/grants', {
      email: 'guest@example.ru',
      days: 7,
    });
    expect(res.status).toBe(201);
    const verified = await db.user.findUniqueOrThrow({ where: { email: 'guest@example.ru' } });
    expect(verified.id).not.toBe(provisional.id);
    expect(await db.user.findUniqueOrThrow({ where: { id: provisional.id } })).toMatchObject({
      isProvisional: true,
      email: null,
      blockedAt: null,
    });
  });
});

describe('orders', () => {
  it('refund revokes access visible in GET /access', async () => {
    const { user, order, entitlement } = await paidBuyer('buyer@example.ru');
    const buyer = as(await cookieFor(user.id, 'user'));
    expect((await buyer.get('/access')).body.state.kind).toBe('active');

    const res = await admin().post(`/admin/billing/orders/${order.id}/refund`, {
      note: 'Вернули в кабинете Platega',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: order.id, status: 'refunded' });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('refunded');
    const revoked = await db.entitlement.findUniqueOrThrow({ where: { id: entitlement.id } });
    expect(revoked.revokedAt).not.toBeNull();
    expect((await buyer.get('/access')).body.state.kind).toBe('none');

    const again = await admin().post(`/admin/billing/orders/${order.id}/refund`, { note: '' });
    expect(again.status).toBe(201);
    expect(again.body.status).toBe('refunded');
    expect(
      (await db.entitlement.findUniqueOrThrow({ where: { id: entitlement.id } })).revokedAt,
    ).toEqual(revoked.revokedAt);
    expect(await db.auditLog.count({ where: { action: 'order.refund' } })).toBe(1);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'order.refund' } });
    expect(audit).toMatchObject({ actorId: adminId, entity: 'order', entityId: order.id });
  });

  it('refund of current period pulls the chained period forward', async () => {
    const start = new Date(Date.now() - 5 * DAY_MS);
    const a = await paidBuyer('chain@example.ru', start);
    const b = await paidOrder(
      a.user.id,
      a.subscription.id,
      'chain@example.ru',
      a.entitlement.expiresAt,
    );
    const t0 = Date.now();
    const res = await admin().post(`/admin/billing/orders/${a.order.id}/refund`, { note: '' });
    expect(res.status).toBe(201);

    const moved = await db.entitlement.findUniqueOrThrow({ where: { id: b.entitlement.id } });
    expect(moved.revokedAt).toBeNull();
    expect(moved.startsAt.getTime()).toBeGreaterThanOrEqual(t0 - 1000);
    expect(moved.startsAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(moved.expiresAt.getTime() - moved.startsAt.getTime()).toBe(30 * DAY_MS);

    const access = await as(await cookieFor(a.user.id, 'user')).get('/access');
    expect(access.body.state).toMatchObject({
      kind: 'active',
      until: moved.expiresAt.toISOString(),
    });

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'order.refund' } });
    expect((audit.diff as { moved: unknown }).moved).toEqual([
      {
        entitlementId: b.entitlement.id,
        from: {
          startsAt: b.entitlement.startsAt.toISOString(),
          expiresAt: b.entitlement.expiresAt.toISOString(),
        },
        to: { startsAt: moved.startsAt.toISOString(), expiresAt: moved.expiresAt.toISOString() },
      },
    ]);
  });

  it('refund of a future period leaves the current one untouched', async () => {
    const a = await paidBuyer('future@example.ru', new Date(Date.now() - 5 * DAY_MS));
    const b = await paidOrder(
      a.user.id,
      a.subscription.id,
      'future@example.ru',
      a.entitlement.expiresAt,
    );
    const res = await admin().post(`/admin/billing/orders/${b.order.id}/refund`, { note: '' });
    expect(res.status).toBe(201);
    expect(await db.entitlement.findUniqueOrThrow({ where: { id: a.entitlement.id } })).toEqual(
      a.entitlement,
    );
    expect(
      (await db.entitlement.findUniqueOrThrow({ where: { id: b.entitlement.id } })).revokedAt,
    ).not.toBeNull();
    const access = await as(await cookieFor(a.user.id, 'user')).get('/access');
    expect(access.body.state.until).toBe(a.entitlement.expiresAt.toISOString());
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'order.refund' } });
    expect((audit.diff as { moved: unknown }).moved).toEqual([]);
  });

  it('refuses to refund an unpaid order', async () => {
    const { order } = await paidBuyer('buyer@example.ru');
    await db.order.update({ where: { id: order.id }, data: { status: 'pending', paidAt: null } });
    const res = await admin().post(`/admin/billing/orders/${order.id}/refund`, { note: '' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('REFUND_NOT_PAID');
    expect((await admin().post('/admin/billing/orders/nope/refund', {})).status).toBe(404);
  });

  it('lists orders newest first with email and status filters and a cursor', async () => {
    const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12));
    const a = await paidBuyer('alpha@example.ru', day(1));
    const b = await paidBuyer('beta@example.ru', day(2));
    await db.order.update({ where: { id: a.order.id }, data: { createdAt: day(1) } });
    await db.order.update({ where: { id: b.order.id }, data: { createdAt: day(2) } });

    const all = await admin().get('/admin/billing/orders');
    expect(all.status).toBe(200);
    expect(all.body.items.map((o: { id: string }) => o.id)).toEqual([b.order.id, a.order.id]);
    expect(all.body.items[0]).toEqual({
      id: b.order.id,
      email: 'beta@example.ru',
      userEmail: 'beta@example.ru',
      amountRub: PRICE,
      status: 'paid',
      createdAt: day(2).toISOString(),
      paidAt: day(2).toISOString(),
      accessStartsAt: day(2).toISOString(),
      accessUntil: new Date(day(2).getTime() + 30 * DAY_MS).toISOString(),
      revokedAt: null,
    });
    expect(JSON.stringify(all.body)).not.toMatch(/providerPaymentId|redirectUrl|checkoutKey/);

    const byEmail = await admin().get('/admin/billing/orders?email=ALPHA@');
    expect(byEmail.body.items.map((o: { id: string }) => o.id)).toEqual([a.order.id]);

    await db.order.update({ where: { id: a.order.id }, data: { status: 'failed' } });
    const failed = await admin().get('/admin/billing/orders?status=failed');
    expect(failed.body.items.map((o: { id: string }) => o.id)).toEqual([a.order.id]);
    expect((await admin().get('/admin/billing/orders?status=bogus')).status).toBe(400);

    for (let i = 0; i < 55; i++) await paidBuyer(`many${i}@example.ru`);
    const first = await admin().get('/admin/billing/orders');
    expect(first.body.items).toHaveLength(50);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await admin().get(`/admin/billing/orders?cursor=${first.body.nextCursor}`);
    expect(second.body.items).toHaveLength(7);
    expect(second.body.nextCursor).toBeNull();
    const ids = new Set([...first.body.items, ...second.body.items].map((o) => o.id));
    expect(ids.size).toBe(57);
    expect((await admin().get('/admin/billing/orders?cursor=%%%')).status).toBe(400);
  });
});

describe('subscriptions', () => {
  it('lists subscriptions with access end and device by email', async () => {
    const { subscription, entitlement } = await paidBuyer('buyer@example.ru');
    await paidBuyer('other@example.ru');
    const res = await admin().get('/admin/billing/subscriptions?email=buyer');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: subscription.id,
      email: 'buyer@example.ru',
      provisional: false,
      device: null,
      accessUntil: entitlement.expiresAt.toISOString(),
      rights: [
        {
          id: entitlement.id,
          startsAt: entitlement.startsAt.toISOString(),
          expiresAt: entitlement.expiresAt.toISOString(),
          revokedAt: null,
          source: 'order',
          note: null,
        },
      ],
    });
  });
});

it('support role gets 403', async () => {
  const { order } = await paidBuyer('buyer@example.ru');
  const calls = [
    support().get('/admin/billing/plan'),
    support().patch('/admin/billing/plan', { priceRub: 1 }),
    support().get('/admin/billing/orders'),
    support().get('/admin/billing/subscriptions'),
    support().post('/admin/billing/grants', { email: 'x@example.ru', days: 1 }),
    support().post(`/admin/billing/orders/${order.id}/refund`, {}),
  ];
  for (const res of await Promise.all(calls)) {
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('buyer@example.ru');
  }
  const buyer = as(await cookieFor(order.userId, 'user'));
  expect((await buyer.get('/admin/billing/orders')).status).toBe(403);
  expect((await request(app.getHttpServer()).get('/api/v1/admin/billing/orders')).status).toBe(401);
  expect(await db.entitlement.count({ where: { grantedById: { not: null } } })).toBe(0);
  expect((await db.plan.findFirstOrThrow()).priceRub).toBe(PRICE);
});
