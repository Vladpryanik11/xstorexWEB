import { generateKeyPairSync } from 'node:crypto';
import { jwtVerify } from 'jose';
import { expect, it } from 'vitest';
import { signAscJwt } from './jwt.js';

it('signs an ES256 JWT with the ASC claims and a 15-minute lifetime', async () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const now = new Date('2026-11-05T09:00:00Z');
  const token = await signAscJwt({
    keyId: 'TESTKEY',
    issuerId: 'test-issuer',
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    now,
  });
  const { payload, protectedHeader } = await jwtVerify(token, pair.publicKey, {
    audience: 'appstoreconnect-v1',
    issuer: 'test-issuer',
    currentDate: now,
  });
  expect(protectedHeader).toMatchObject({ alg: 'ES256', kid: 'TESTKEY', typ: 'JWT' });
  expect(payload.iat).toBe(1793869200);
  expect(payload.exp).toBe(1793870100);
});

it('does not echo a malformed private key in its failure', async () => {
  await expect(
    signAscJwt({
      keyId: 'x',
      issuerId: 'y',
      privateKeyPem: 'SENSITIVE-KEY-MATERIAL',
      now: new Date(),
    }),
  ).rejects.toThrow('Не удалось подписать токен Apple');
});
