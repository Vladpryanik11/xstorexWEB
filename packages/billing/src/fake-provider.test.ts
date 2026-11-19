import { createHmac } from 'node:crypto';
import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { createFakeProvider } from './fake-provider.js';

/** In-memory stand-in for the two Redis commands the fake provider uses. */
function memoryRedis(): Redis {
  const data = new Map<string, string>();
  return {
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async set(key: string, value: string, ...args: unknown[]) {
      if (args.includes('NX') && data.has(key)) return null;
      data.set(key, value);
      return 'OK';
    },
  } as unknown as Redis;
}

const opts = { siteUrl: 'https://xstorex.test', webhookSecret: 'whsec-test' };
const input = {
  orderId: 'o1',
  amountRub: 299,
  description: 'Подписка на месяц',
  returnUrl: 'https://xstorex.test/get?order=o1',
  idempotencyKey: 'k1',
};

describe('fake provider', () => {
  it('same idempotencyKey returns same payment', async () => {
    const p = createFakeProvider(memoryRedis(), opts);
    const a = await p.createPayment(input);
    const b = await p.createPayment(input);
    expect(b).toEqual(a);
    expect(a.redirectUrl).toBe(`https://xstorex.test/dev/pay/${a.providerPaymentId}`);
    const c = await p.createPayment({ ...input, idempotencyKey: 'k2' });
    expect(c.providerPaymentId).not.toBe(a.providerPaymentId);
    expect(await p.getPayment(a.providerPaymentId)).toEqual({
      status: 'pending',
      amountRub: 299,
      currency: 'RUB',
      paidAt: null,
    });
  });

  it('webhook with wrong signature throws', async () => {
    const p = createFakeProvider(memoryRedis(), opts);
    const body = Buffer.from(JSON.stringify({ paymentId: 'pay1', eventId: 'ev1' }));
    const good = createHmac('sha256', opts.webhookSecret).update(body).digest('hex');
    expect(p.authenticateWebhook({ 'x-fake-signature': good }, body)).toEqual({
      providerPaymentId: 'pay1',
      eventKey: 'fake:ev1',
    });
    const bad = createHmac('sha256', 'other').update(body).digest('hex');
    expect(() => p.authenticateWebhook({ 'x-fake-signature': bad }, body)).toThrow();
    expect(() => p.authenticateWebhook({}, body)).toThrow();
    expect(() => p.authenticateWebhook({ 'x-fake-signature': 'zz' }, body)).toThrow();
  });

  it('setStatus paid keeps the first paidAt', async () => {
    const p = createFakeProvider(memoryRedis(), opts);
    const { providerPaymentId: id } = await p.createPayment(input);
    const t = new Date('2026-11-18T10:00:00.000Z');
    await p.setStatus(id, 'paid', t);
    await p.setStatus(id, 'paid', new Date('2026-11-19T10:00:00.000Z'));
    expect((await p.getPayment(id)).paidAt).toEqual(t);
    expect((await p.getPayment(id)).status).toBe('paid');
  });
});
