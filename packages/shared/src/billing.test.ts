import { expect, it } from 'vitest';
import { checkoutRequestSchema, orderViewSchema, planViewSchema } from './billing.js';
import { errorMessages } from './errors.js';

const base = { checkoutKey: '3f0c2a52-5b0e-4c1c-9d3e-0b6f6a1f8a11', email: 'a@b.ru' };

it('checkoutRequestSchema rejects missing acceptTerms', () => {
  expect(checkoutRequestSchema.safeParse(base).success).toBe(false);
  expect(checkoutRequestSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
  expect(checkoutRequestSchema.safeParse({ ...base, acceptTerms: true }).success).toBe(true);
});

it('orderViewSchema accepts paid order with null returnTo', () => {
  expect(
    orderViewSchema.safeParse({
      id: 'o1',
      status: 'paid',
      amountRub: 1,
      paidAt: '2026-11-18T10:00:00.000Z',
      returnTo: null,
      accessUntil: null,
    }).success,
  ).toBe(true);
});

it('planViewSchema requires whole positive rubles', () => {
  expect(
    planViewSchema.safeParse({ code: 'month', title: 'x', durationDays: 30, priceRub: 0 }).success,
  ).toBe(false);
});

it('has billing error messages', () => {
  expect(errorMessages.PAYMENT_FAILED).toBe('Оплата не прошла. Попробуйте ещё раз');
  expect(errorMessages.WEAK_PASSWORD).toBe('Пароль должен быть от 8 до 128 символов');
});

it('checkoutRequestSchema normalizes the email', () => {
  const r = checkoutRequestSchema.parse({ ...base, email: '  A@B.RU ', acceptTerms: true });
  expect(r.email).toBe('a@b.ru');
});
