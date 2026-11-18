import { expect, it } from 'vitest';
import {
  customerLoginSchema,
  emailCodeRequestSchema,
  emailCodeVerifySchema,
  isAcceptablePassword,
  setPasswordSchema,
  staffLoginSchema,
} from './auth.js';

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

it('customer login normalizes the email and needs a password', () => {
  expect(
    customerLoginSchema.parse({ email: ' Buyer@Example.RU ', password: 'secret12' }).email,
  ).toBe('buyer@example.ru');
  expect(customerLoginSchema.safeParse({ email: 'a@b.ru', password: '' }).success).toBe(false);
});

it('code request and verify normalize the email', () => {
  expect(emailCodeRequestSchema.parse({ email: ' A@B.RU' }).email).toBe('a@b.ru');
  expect(emailCodeVerifySchema.parse({ email: 'A@b.ru ', code: '012345' })).toEqual({
    email: 'a@b.ru',
    code: '012345',
  });
});

it('a buyer password is 8 to 128 characters', () => {
  expect(isAcceptablePassword('1234567')).toBe(false);
  expect(isAcceptablePassword('12345678')).toBe(true);
  expect(isAcceptablePassword('x'.repeat(128))).toBe(true);
  expect(isAcceptablePassword('x'.repeat(129))).toBe(false);
  // The length check is the server's, so a short password reaches it (WEAK_PASSWORD).
  expect(setPasswordSchema.safeParse({ password: 'short' }).success).toBe(true);
  expect(setPasswordSchema.safeParse({}).success).toBe(false);
});
