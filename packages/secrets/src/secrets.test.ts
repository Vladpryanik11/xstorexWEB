import { createCipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, reencrypt } from './decrypt.js';
import { encryptSecret } from './encrypt.js';
import { SecretFormatError, SecretKeyMissingError, SecretTamperedError } from './errors.js';
import { loadKeyring } from './keyring.js';

const key1 = Buffer.alloc(32, 1);
const key2 = Buffer.alloc(32, 2);
const v1 = { current: 1, keys: new Map([[1, key1]]) };
const v2 = {
  current: 2,
  keys: new Map([
    [1, key1],
    [2, key2],
  ]),
};

describe('versioned secrets', () => {
  it.each(['секрет Apple', '', Buffer.from([0, 255, 128, 42])])(
    'round-trips bytes: %s',
    (plain) => {
      expect(decryptSecret(encryptSecret(plain, v1), v1)).toEqual(Buffer.from(plain));
    },
  );

  it('uses a fresh 12-byte IV on every encryption', () => {
    const first = encryptSecret('same', v1);
    const second = encryptSecret('same', v1);
    expect(first).not.toBe(second);
    expect(Buffer.from(first.split('.')[1] ?? '', 'base64url')).toHaveLength(12);
  });

  it('reads an independently constructed AES-256-GCM envelope', () => {
    const iv = Buffer.alloc(12, 9);
    const cipher = createCipheriv('aes-256-gcm', key1, iv);
    const encrypted = Buffer.concat([cipher.update('fixture'), cipher.final()]);
    const envelope = `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
    expect(decryptSecret(envelope, v1).toString()).toBe('fixture');
  });

  it.each([1, 2, 3])('detects tampering in envelope part %i', (part) => {
    const parts = encryptSecret('confidential', v1).split('.');
    const bytes = Buffer.from(parts[part] ?? '', 'base64url');
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    parts[part] = bytes.toString('base64url');
    expect(() => decryptSecret(parts.join('.'), v1)).toThrow(SecretTamperedError);
  });

  it('detects a wrong decryption key without leaking plaintext', () => {
    const enc = encryptSecret('never-print-this', v1);
    expect(() => decryptSecret(enc, { current: 1, keys: new Map([[1, key2]]) })).toThrow(
      SecretTamperedError,
    );
    try {
      decryptSecret(enc, { current: 1, keys: new Map([[1, key2]]) });
    } catch (error) {
      expect(String(error)).not.toContain(enc);
      expect(String(error)).not.toContain('never-print-this');
    }
  });

  it('decrypts old versions and reencrypts them under the current key', () => {
    const old = encryptSecret('rotate me', v1);
    expect(decryptSecret(old, v2).toString()).toBe('rotate me');
    const rotated = reencrypt(old, v2);
    expect(rotated.startsWith('v2.')).toBe(true);
    expect(decryptSecret(rotated, { current: 2, keys: new Map([[2, key2]]) }).toString()).toBe(
      'rotate me',
    );
    expect(() => decryptSecret(old, { current: 2, keys: new Map([[2, key2]]) })).toThrow(
      SecretKeyMissingError,
    );
  });

  it.each([
    'sensitive-input',
    'v0.a.b.c',
    'v01.a.b.c',
    'v1.a.b.c',
    'v1.@@@@.x.y',
    'v1.a.b.c.extra',
  ])('rejects malformed envelopes without echoing them: %s', (enc) => {
    expect(() => decryptSecret(enc, v1)).toThrow(SecretFormatError);
    try {
      decryptSecret(enc, v1);
    } catch (error) {
      expect(String(error)).not.toContain(enc);
    }
  });

  it('rejects non-canonical base64url encodings', () => {
    const parts = encryptSecret('x', v1).split('.');
    parts[2] = `${parts[2]}==`;
    expect(() => decryptSecret(parts.join('.'), v1)).toThrow(SecretFormatError);
  });
});

describe('keyring startup validation', () => {
  it('loads the current key and retained old versions', () => {
    const ring = loadKeyring({
      MASTER_KEY_CURRENT: '2',
      MASTER_KEY_V1: key1.toString('base64'),
      MASTER_KEY_V2: key2.toString('base64'),
    });
    expect(ring.current).toBe(2);
    expect(ring.keys.get(1)).toEqual(key1);
    expect(ring.keys.get(2)).toEqual(key2);
  });

  it.each([
    {},
    { MASTER_KEY_CURRENT: '2' },
    { MASTER_KEY_CURRENT: '01' },
    { MASTER_KEY_CURRENT: '-1' },
  ])('refuses missing or invalid current keys: %j', (env) => {
    expect(() => loadKeyring(env)).toThrow(SecretKeyMissingError);
  });

  it.each([
    'TOP-SECRET-BAD-KEY',
    randomBytes(31).toString('base64'),
    `${key1.toString('base64')}garbage`,
  ])('rejects invalid key bytes without echoing values', (key) => {
    expect(() => loadKeyring({ MASTER_KEY_CURRENT: '1', MASTER_KEY_V1: key })).toThrow(
      /MASTER_KEY_V1/,
    );
    try {
      loadKeyring({ MASTER_KEY_CURRENT: '1', MASTER_KEY_V1: key });
    } catch (error) {
      expect(String(error)).not.toContain(key);
    }
  });

  it('validates retained old keys as well as the current one', () => {
    expect(() =>
      loadKeyring({
        MASTER_KEY_CURRENT: '2',
        MASTER_KEY_V1: 'bad',
        MASTER_KEY_V2: key2.toString('base64'),
      }),
    ).toThrow(/MASTER_KEY_V1/);
  });
});
