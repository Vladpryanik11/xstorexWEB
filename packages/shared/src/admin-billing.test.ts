import { expect, it } from 'vitest';
import {
  adminOrdersQuerySchema,
  grantRequestSchema,
  refundRequestSchema,
  updatePlanSchema,
} from './admin-billing.js';
import { errorMessages } from './errors.js';

it('updatePlanSchema takes whole positive rubles and refuses an empty patch', () => {
  expect(updatePlanSchema.parse({ priceRub: 499 })).toEqual({ priceRub: 499 });
  for (const priceRub of [0, -1, 1.5, '499']) {
    expect(updatePlanSchema.safeParse({ priceRub }).success).toBe(false);
  }
  expect(updatePlanSchema.safeParse({}).success).toBe(false);
  expect(updatePlanSchema.safeParse({ durationDays: 60 }).success).toBe(false);
  expect(updatePlanSchema.parse({ title: '  Месяц ', active: false })).toEqual({
    title: 'Месяц',
    active: false,
  });
});

it('grantRequestSchema normalizes the email and bounds days to 1..365', () => {
  expect(grantRequestSchema.parse({ email: ' A@B.RU ', days: 30 })).toEqual({
    email: 'a@b.ru',
    days: 30,
    note: '',
  });
  for (const days of [0, 366, 2.5]) {
    expect(grantRequestSchema.safeParse({ email: 'a@b.ru', days }).success).toBe(false);
  }
  expect(
    grantRequestSchema.safeParse({ email: 'a@b.ru', days: 1, note: 'x'.repeat(501) }).success,
  ).toBe(false);
});

it('refundRequestSchema defaults the note', () => {
  expect(refundRequestSchema.parse({})).toEqual({ note: '' });
});

it('adminOrdersQuerySchema accepts known statuses only', () => {
  expect(adminOrdersQuerySchema.parse({ status: 'paid', email: ' Ab ' })).toEqual({
    status: 'paid',
    email: 'ab',
  });
  expect(adminOrdersQuerySchema.safeParse({ status: 'bogus' }).success).toBe(false);
  expect(adminOrdersQuerySchema.parse({ email: '' })).toEqual({});
});

it('has admin billing error messages', () => {
  expect(errorMessages.GRANT_STAFF_EMAIL).toBe(
    'Эта почта принадлежит сотруднику, выдать на неё доступ нельзя',
  );
  expect(errorMessages.REFUND_NOT_PAID).toBe('Отметить возврат можно только у оплаченного заказа');
});
