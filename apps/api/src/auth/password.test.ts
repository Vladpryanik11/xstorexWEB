import { expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

it('verifies its own hash and rejects others', async () => {
  const hash = await hashPassword('correct horse');
  expect(hash.startsWith('$argon2id$')).toBe(true);
  expect(await verifyPassword(hash, 'correct horse')).toBe(true);
  expect(await verifyPassword(hash, 'wrong')).toBe(false);
});

it('treats a malformed hash as a mismatch', async () => {
  expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
});
