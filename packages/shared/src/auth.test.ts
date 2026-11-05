import { expect, it } from 'vitest';
import { staffLoginSchema } from './auth.js';

it('normalizes the email', () => {
  expect(
    staffLoginSchema.parse({ email: '  Admin@XstoreX.ru ', password: 'pw', totp: '123456' }).email,
  ).toBe('admin@xstorex.ru');
});

it('requires a six-digit code', () => {
  expect(
    staffLoginSchema.safeParse({ email: 'a@b.ru', password: 'pw', totp: '12345' }).success,
  ).toBe(false);
  expect(
    staffLoginSchema.safeParse({ email: 'a@b.ru', password: 'pw', totp: '12345a' }).success,
  ).toBe(false);
});
