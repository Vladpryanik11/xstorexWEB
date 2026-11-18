import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '@xstore/db';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { applyPayment } from '../src/apply-payment.js';
import { createFakeProvider } from '../src/fake-provider.js';

// biome-ignore lint/style/noNonNullAssertion: guaranteed by global-setup
const db = createPrismaClient(process.env.DATABASE_URL_TEST!);
// biome-ignore lint/style/noNonNullAssertion: guaranteed by global-setup
const redis = new Redis(process.env.REDIS_URL_TEST!);
const provider = createFakeProvider(redis, {
  siteUrl: 'https://xstorex.test',
  webhookSecret: 'whsec-test',
});
afterAll(async () => {
  await db.$disconnect();
  redis.disconnect();
});

const DAY = 86_400_000;
const snapshot = { code: 'month', title: 'Подписка на месяц', durationDays: 30, priceRub: 1 };

async function subscription() {
  const user = await db.user.create({ data: { email: `${randomUUID()}@x.ru` } });
  const sub = await db.subscription.create({ data: { userId: user.id } });
  return { userId: user.id, subscriptionId: sub.id };
}

/** Creates an order on the subscription and a fake payment for it (provider amount may differ). */
async function order(s: { userId: string; subscriptionId: string }, providerAmount = 1) {
  const plan = await db.plan.upsert({
    where: { code: 'month' },
    create: { code: 'month', title: snapshot.title, durationDays: 30, priceRub: 1 },
    update: {},
  });
  const created = await db.order.create({
    data: {
      ...s,
      planId: plan.id,
      planSnapshot: snapshot,
      checkoutEmail: 'a@b.ru',
      checkoutKey: randomUUID(),
      amountRub: 1,
      status: 'created',
      provider: provider.name,
      expiresAt: new Date(Date.now() + DAY),
    },
  });
  const pay = await provider.createPayment({
    orderId: created.id,
    amountRub: providerAmount,
    description: snapshot.title,
    returnUrl: 'https://xstorex.test/get',
    idempotencyKey: created.id,
  });
  await db.order.update({
    where: { id: created.id },
    data: { status: 'pending', providerPaymentId: pay.providerPaymentId },
  });
  return { orderId: created.id, paymentId: pay.providerPaymentId };
}

describe('applyPayment', () => {
  it('paid payment grants 30 days from provider paidAt', async () => {
    const s = await subscription();
    const o = await order(s);
    const paidAt = new Date('2026-11-18T10:00:00.000Z');
    await provider.setStatus(o.paymentId, 'paid', paidAt);

    const r = await applyPayment(db, provider, o.paymentId, { kind: 'reconcile' });

    const expiresAt = new Date(paidAt.getTime() + 30 * DAY);
    expect(r).toEqual({ result: 'granted', orderId: o.orderId, accessUntil: expiresAt });
    const saved = await db.order.findUniqueOrThrow({
      where: { id: o.orderId },
      include: { entitlement: true },
    });
    expect(saved.status).toBe('paid');
    expect(saved.paidAt).toEqual(paidAt);
    expect(saved.entitlement).toMatchObject({
      subscriptionId: s.subscriptionId,
      planCode: 'month',
      durationDays: 30,
      startsAt: paidAt,
      expiresAt,
    });
  });

  it('replayed webhook returns already and keeps dates', async () => {
    const s = await subscription();
    const o = await order(s);
    const paidAt = new Date('2026-11-18T11:00:00.000Z');
    await provider.setStatus(o.paymentId, 'paid', paidAt);
    const eventKey = `fake:${randomUUID()}`;
    const source = { kind: 'webhook' as const, eventKey, payload: { id: o.paymentId } };

    const first = await applyPayment(db, provider, o.paymentId, source);
    const before = await db.entitlement.findMany({ where: { subscriptionId: s.subscriptionId } });
    const again = await applyPayment(db, provider, o.paymentId, source);
    const viaReconcile = await applyPayment(db, provider, o.paymentId, { kind: 'reconcile' });

    expect(first.result).toBe('granted');
    expect(again).toEqual({
      result: 'already',
      orderId: o.orderId,
      accessUntil: first.accessUntil,
    });
    expect(viaReconcile.result).toBe('already');
    const after = await db.entitlement.findMany({ where: { subscriptionId: s.subscriptionId } });
    expect(after).toEqual(before);
    expect(after).toHaveLength(1);
    const events = await db.paymentEvent.findMany({ where: { eventKey } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: 'fake', result: 'granted' });
    expect(events[0]?.processedAt).toBeInstanceOf(Date);
  });

  it('concurrent applyPayment calls create one entitlement', async () => {
    const s = await subscription();
    const o = await order(s);
    await provider.setStatus(o.paymentId, 'paid');

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        applyPayment(db, provider, o.paymentId, {
          kind: 'webhook',
          eventKey: `fake:${o.paymentId}:${i % 2}`,
        }),
      ),
    );

    expect(results.filter((r) => r.result === 'granted')).toHaveLength(1);
    expect(results.filter((r) => r.result === 'already')).toHaveLength(4);
    expect(await db.entitlement.count({ where: { subscriptionId: s.subscriptionId } })).toBe(1);
  });

  it('amount mismatch writes no rights and returns mismatch', async () => {
    const s = await subscription();
    const o = await order(s, 2);
    await provider.setStatus(o.paymentId, 'paid');
    const eventKey = `fake:${randomUUID()}`;

    const r = await applyPayment(db, provider, o.paymentId, { kind: 'webhook', eventKey });

    expect(r).toEqual({ result: 'mismatch', orderId: o.orderId });
    expect(await db.entitlement.count({ where: { subscriptionId: s.subscriptionId } })).toBe(0);
    const saved = await db.order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(saved.status).toBe('pending');
    expect(saved.paidAt).toBeNull();
    const event = await db.paymentEvent.findUniqueOrThrow({ where: { eventKey } });
    expect(event.result).toBe('mismatch');
  });

  it('failed status marks order failed', async () => {
    const s = await subscription();
    const o = await order(s);
    await provider.setStatus(o.paymentId, 'failed');

    const r = await applyPayment(db, provider, o.paymentId, { kind: 'reconcile' });

    expect(r).toEqual({ result: 'failed', orderId: o.orderId });
    const saved = await db.order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(saved.status).toBe('failed');
    expect(await db.entitlement.count({ where: { subscriptionId: s.subscriptionId } })).toBe(0);
  });

  it('pending payment changes nothing', async () => {
    const s = await subscription();
    const o = await order(s);

    const r = await applyPayment(db, provider, o.paymentId, { kind: 'return' });

    expect(r).toEqual({ result: 'pending', orderId: o.orderId });
    const saved = await db.order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(saved.status).toBe('pending');
  });

  it('renewal starts after current period end', async () => {
    const s = await subscription();
    const first = await order(s);
    const t = new Date('2026-11-18T12:00:00.000Z');
    await provider.setStatus(first.paymentId, 'paid', t);
    await applyPayment(db, provider, first.paymentId, { kind: 'reconcile' });

    const second = await order(s);
    await provider.setStatus(second.paymentId, 'paid', new Date(t.getTime() + 10 * DAY));
    const r = await applyPayment(db, provider, second.paymentId, { kind: 'reconcile' });

    expect(r.result).toBe('granted');
    expect(r.accessUntil).toEqual(new Date(t.getTime() + 60 * DAY));
    const e = await db.entitlement.findUniqueOrThrow({ where: { orderId: second.orderId } });
    expect(e.startsAt).toEqual(new Date(t.getTime() + 30 * DAY));
    expect(e.expiresAt).toEqual(new Date(t.getTime() + 60 * DAY));
  });

  it('concurrent payments of two orders on one subscription do not overlap', async () => {
    const s = await subscription();
    const t = new Date('2026-11-18T13:00:00.000Z');
    const orders = [await order(s), await order(s), await order(s)];
    for (const o of orders) await provider.setStatus(o.paymentId, 'paid', t);

    const results = await Promise.all(
      orders.map((o) => applyPayment(db, provider, o.paymentId, { kind: 'reconcile' })),
    );

    expect(results.map((r) => r.result)).toEqual(['granted', 'granted', 'granted']);
    const rights = await db.entitlement.findMany({
      where: { subscriptionId: s.subscriptionId },
      orderBy: { startsAt: 'asc' },
    });
    expect(rights.map((e) => e.startsAt)).toEqual(
      [0, 30, 60].map((d) => new Date(t.getTime() + d * DAY)),
    );
  });

  it('event first seen while pending grants when replayed after payment', async () => {
    const s = await subscription();
    const o = await order(s);
    const eventKey = `fake:${randomUUID()}`;
    const source = { kind: 'webhook' as const, eventKey };

    const early = await applyPayment(db, provider, o.paymentId, source);
    await provider.setStatus(o.paymentId, 'paid');
    const replay = await applyPayment(db, provider, o.paymentId, source);

    expect(early.result).toBe('pending');
    expect(replay.result).toBe('granted');
    expect(await db.entitlement.count({ where: { subscriptionId: s.subscriptionId } })).toBe(1);
    const event = await db.paymentEvent.findUniqueOrThrow({ where: { eventKey } });
    expect(event.result).toBe('granted');
  });

  it('event key reused by another order does not block either grant', async () => {
    const a = await order(await subscription());
    const b = await order(await subscription());
    await provider.setStatus(a.paymentId, 'paid');
    await provider.setStatus(b.paymentId, 'paid');
    const eventKey = `fake:${randomUUID()}`;

    const results = await Promise.all(
      [a, b].map((o) => applyPayment(db, provider, o.paymentId, { kind: 'webhook', eventKey })),
    );

    expect(results.map((r) => r.result)).toEqual(['granted', 'granted']);
    expect(await db.paymentEvent.count({ where: { eventKey } })).toBe(1);
  });

  it('unknown payment id returns unknown_order without writes', async () => {
    const eventKey = `fake:${randomUUID()}`;
    const r = await applyPayment(db, provider, `missing-${randomUUID()}`, {
      kind: 'webhook',
      eventKey,
    });
    expect(r).toEqual({ result: 'unknown_order' });
    expect(await db.paymentEvent.count({ where: { eventKey } })).toBe(0);
  });
});
