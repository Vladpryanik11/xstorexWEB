import { createCipheriv, randomBytes } from 'node:crypto';
import { type Keyring, keyFor } from './keyring.js';

export function encryptSecret(plain: Buffer | string, keyring: Keyring): string {
  const key = keyFor(keyring, keyring.current);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return `v${keyring.current}.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
