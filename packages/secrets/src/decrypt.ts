import { createDecipheriv } from 'node:crypto';
import { encryptSecret } from './encrypt.js';
import { SecretFormatError, SecretTamperedError } from './errors.js';
import { type Keyring, keyFor, validVersion } from './keyring.js';

function decode(part: string): Buffer {
  const bytes = Buffer.from(part, 'base64url');
  if (bytes.toString('base64url') !== part) throw new SecretFormatError();
  return bytes;
}

export function decryptSecret(enc: string, keyring: Keyring): Buffer {
  const parts = enc.split('.');
  const [versionPart = '', ivPart = '', tagPart = '', dataPart = ''] = parts;
  if (parts.length !== 4 || !versionPart.startsWith('v') || !validVersion(versionPart.slice(1))) {
    throw new SecretFormatError();
  }
  const iv = decode(ivPart);
  const tag = decode(tagPart);
  const encrypted = decode(dataPart);
  if (iv.length !== 12 || tag.length !== 16) throw new SecretFormatError();
  const key = keyFor(keyring, Number(versionPart.slice(1)));
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch {
    throw new SecretTamperedError();
  }
}

export function reencrypt(enc: string, keyring: Keyring): string {
  const plain = decryptSecret(enc, keyring);
  try {
    return encryptSecret(plain, keyring);
  } finally {
    plain.fill(0);
  }
}
