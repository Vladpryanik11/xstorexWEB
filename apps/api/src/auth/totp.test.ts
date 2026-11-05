import { expect, it } from 'vitest';
import { verifyTotp } from './totp.js';

// RFC 6238 SHA1 test secret ("12345678901234567890") in base32.
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

it('accepts the code for the current step and ±1', () => {
  const now = new Date(59_000);
  expect(verifyTotp(SECRET, '287082', now)).toBe(1);
  expect(verifyTotp(SECRET, '287082', new Date(89_000))).toBe(1);
  expect(verifyTotp(SECRET, '000000', now)).toBeNull();
});

it('rejects codes outside the window', () => {
  expect(verifyTotp(SECRET, '287082', new Date(120_000))).toBeNull();
});

it('rejects malformed codes', () => {
  expect(verifyTotp(SECRET, '28708', new Date(59_000))).toBeNull();
  expect(verifyTotp(SECRET, 'abcdef', new Date(59_000))).toBeNull();
});
