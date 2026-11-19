import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { PaymentProvider, ProviderPaymentStatus } from './provider.js';

/** Payments live 30 days in Redis: longer than any unpaid order and the reconcile window. */
const TTL_SECONDS = 30 * 24 * 60 * 60;
const key = (id: string) => `xs:fakepay:${id}`;
const idemKey = (k: string) => `xs:fakepay:idem:${k}`;

type Stored = {
  status: ProviderPaymentStatus;
  amountRub: number;
  currency: string;
  paidAt: string | null;
};

export type FakeProvider = PaymentProvider & {
  setStatus(id: string, status: 'paid' | 'failed', paidAt?: Date): Promise<void>;
};

/** HMAC-SHA256 (hex) of the raw webhook body, sent in `x-fake-signature`. */
export function fakeWebhookSignature(webhookSecret: string, rawBody: Buffer): string {
  return createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
}

/** Development-only provider: payments are stored in Redis and paid from `/dev/pay/<id>`. */
export function createFakeProvider(
  redis: Pick<Redis, 'get' | 'set'>,
  opts: { siteUrl: string; webhookSecret: string },
): FakeProvider {
  const redirectUrl = (id: string) => `${opts.siteUrl}/dev/pay/${id}`;

  async function load(id: string): Promise<Stored> {
    const raw = await redis.get(key(id));
    if (!raw) throw new Error('Fake payment not found');
    return JSON.parse(raw) as Stored;
  }

  return {
    name: 'fake',

    async createPayment(i) {
      const candidate = randomUUID();
      const claimed = await redis.set(
        idemKey(i.idempotencyKey),
        candidate,
        'EX',
        TTL_SECONDS,
        'NX',
      );
      const id = claimed ? candidate : await redis.get(idemKey(i.idempotencyKey));
      if (!id) throw new Error('Fake payment idempotency key vanished');
      if (claimed) {
        const stored: Stored = {
          status: 'pending',
          amountRub: i.amountRub,
          currency: 'RUB',
          paidAt: null,
        };
        await redis.set(key(id), JSON.stringify(stored), 'EX', TTL_SECONDS);
      }
      return { providerPaymentId: id, redirectUrl: redirectUrl(id) };
    },

    authenticateWebhook(headers, rawBody) {
      const given = Buffer.from(headers['x-fake-signature'] ?? '', 'hex');
      const expected = Buffer.from(fakeWebhookSignature(opts.webhookSecret, rawBody), 'hex');
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        throw new Error('Invalid webhook signature');
      }
      const body = JSON.parse(rawBody.toString('utf8')) as {
        paymentId?: unknown;
        eventId?: unknown;
      };
      if (typeof body.paymentId !== 'string' || typeof body.eventId !== 'string') {
        throw new Error('Invalid webhook body');
      }
      return { providerPaymentId: body.paymentId, eventKey: `fake:${body.eventId}` };
    },

    async getPayment(id) {
      const p = await load(id);
      return {
        status: p.status,
        amountRub: p.amountRub,
        currency: p.currency,
        paidAt: p.paidAt ? new Date(p.paidAt) : null,
      };
    },

    async setStatus(id, status, paidAt) {
      const p = await load(id);
      if (status === 'paid') {
        p.status = 'paid';
        p.paidAt ??= (paidAt ?? new Date()).toISOString();
      } else if (p.status !== 'paid') {
        p.status = 'failed';
      }
      await redis.set(key(id), JSON.stringify(p), 'EX', TTL_SECONDS);
    },
  };
}
