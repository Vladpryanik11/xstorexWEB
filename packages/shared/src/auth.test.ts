import { expect, it } from 'vitest';
import {
  customerLoginSchema,
  emailCodeRequestSchema,
  emailCodeVerifySchema,
  handoffRedeemSchema,
  handoffResponseSchema,
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

it('a sign-in link token is 43 base64url characters', () => {
  const token = `${'a'.repeat(42)}_`;
  expect(handoffRedeemSchema.parse({ token })).toEqual({ token });
  expect(handoffRedeemSchema.safeParse({ token: 'short' }).success).toBe(false);
  expect(handoffRedeemSchema.safeParse({ token: `${'a'.repeat(42)}=` }).success).toBe(false);
});

it('a sign-in link comes with its end', () => {
  const parsed = handoffResponseSchema.parse({
    token: 'b'.repeat(43),
    expiresAt: '2026-11-20T16:10:00.000Z',
  });
  expect(parsed.expiresAt).toEqual(new Date('2026-11-20T16:10:00.000Z'));
});
