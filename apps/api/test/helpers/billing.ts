import type { createPrismaClient } from '@xstore/db';
import type request from 'supertest';

type Db = ReturnType<typeof createPrismaClient>;

export const SITE = 'http://localhost:3000';
export const PRICE = 299;

export async function seedPlan(
  db: Db,
  overrides: { priceRub?: number; active?: boolean } = {},
): Promise<{ id: string }> {
  return db.plan.create({
    data: {
      code: 'month',
      title: 'Подписка на месяц',
      durationDays: 30,
      priceRub: overrides.priceRub ?? PRICE,
      active: overrides.active ?? true,
    },
    select: { id: true },
  });
}

export const checkoutBody = (checkoutKey: string, extra: Record<string, unknown> = {}) => ({
  checkoutKey,
  email: 'buyer@example.ru',
  acceptTerms: true,
  ...extra,
});

type Agent = ReturnType<typeof request.agent> | ReturnType<typeof request>;

export const postCheckout = (agent: Agent, body: object) =>
  agent.post('/api/v1/billing/checkout').set('Origin', SITE).send(body);

export function setCookieOf(res: { headers: Record<string, unknown> }): string {
  const value = res.headers['set-cookie'];
  return Array.isArray(value) ? String(value[0] ?? '') : '';
}

export function cookieExpiry(res: { headers: Record<string, unknown> }): Date | null {
  const m = /Expires=([^;]+)/.exec(setCookieOf(res));
  return m?.[1] ? new Date(m[1]) : null;
}
