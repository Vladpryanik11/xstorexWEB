import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src/index.js';

// biome-ignore lint/style/noNonNullAssertion: guaranteed by global-setup
const db = createPrismaClient(process.env.DATABASE_URL_TEST!);
afterAll(() => db.$disconnect());

const DAY = 86_400_000;
let seq = 0;

async function fixture() {
  seq++;
  const user = await db.user.create({ data: { email: `u${seq}-${Date.now()}@x.ru` } });
  const plan = await db.plan.upsert({
    where: { code: 'month' },
    create: { code: 'month', title: 'Подписка на месяц', durationDays: 30, priceRub: 1 },
    update: {},
  });
  const subscription = await db.subscription.create({ data: { userId: user.id } });
  return { user, plan, subscription };
}

const orderData = (f: Awaited<ReturnType<typeof fixture>>, checkoutKey: string) => ({
  userId: f.user.id,
  subscriptionId: f.subscription.id,
  planId: f.plan.id,
  planSnapshot: { code: 'month', title: 'Подписка на месяц', durationDays: 30, priceRub: 1 },
  checkoutEmail: 'a@b.ru',
  checkoutKey,
  amountRub: 1,
  status: 'created' as const,
  provider: 'platega',
  expiresAt: new Date(Date.now() + DAY),
});

describe('billing model', () => {
  it('entitlement with dates belongs to subscription without device', async () => {
    const f = await fixture();
    const startsAt = new Date();
    const e = await db.entitlement.create({
      data: {
        subscriptionId: f.subscription.id,
        planCode: 'month',
        durationDays: 30,
        startsAt,
        expiresAt: new Date(startsAt.getTime() + 30 * DAY),
      },
    });
    const sub = await db.subscription.findUniqueOrThrow({
      where: { id: f.subscription.id },
      include: { entitlements: true },
    });
    expect(sub.deviceId).toBeNull();
    expect(sub.entitlements.map((x) => x.id)).toEqual([e.id]);
  });

  it('orders block deleting their user and subscription', async () => {
    const f = await fixture();
    await db.order.create({ data: orderData(f, 'key-restrict') });
    await expect(db.user.delete({ where: { id: f.user.id } })).rejects.toThrow();
    await expect(db.subscription.delete({ where: { id: f.subscription.id } })).rejects.toThrow();
    expect(await db.user.count({ where: { id: f.user.id } })).toBe(1);
  });

  it('duplicate checkoutKey rejected', async () => {
    const f = await fixture();
    await db.order.create({ data: orderData(f, 'key-dup') });
    await expect(db.order.create({ data: orderData(f, 'key-dup') })).rejects.toThrow();
  });

  it('second entitlement for same orderId rejected', async () => {
    const f = await fixture();
    const order = await db.order.create({ data: orderData(f, 'key-ent') });
    const mk = () =>
      db.entitlement.create({
        data: {
          subscriptionId: f.subscription.id,
          planCode: 'month',
          durationDays: 30,
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * DAY),
          orderId: order.id,
        },
      });
    await mk();
    await expect(mk()).rejects.toThrow();
  });

  it('plan with priceRub 0 rejected by CHECK', async () => {
    await expect(
      db.plan.create({ data: { code: 'free', title: 'x', durationDays: 30, priceRub: 0 } }),
    ).rejects.toThrow(/check/i);
    await expect(
      db.plan.create({ data: { code: 'zero', title: 'x', durationDays: 0, priceRub: 5 } }),
    ).rejects.toThrow(/check/i);
  });

  it('entitlement expiresAt <= startsAt rejected', async () => {
    const f = await fixture();
    const t = new Date();
    await expect(
      db.entitlement.create({
        data: {
          subscriptionId: f.subscription.id,
          planCode: 'month',
          durationDays: 30,
          startsAt: t,
          expiresAt: t,
        },
      }),
    ).rejects.toThrow(/check/i);
  });
});
