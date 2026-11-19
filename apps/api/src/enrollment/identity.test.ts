import { generateKeyPairSync, type KeyObject, X509Certificate } from 'node:crypto';
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { IdentityError, IdentityStore } from './identity.js';
import { issueCertificate } from './x509.js';

let dir: string;
let certPath: string;
let keyPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'xstore-identity-'));
  certPath = join(dir, 'cert.pem');
  keyPath = join(dir, 'key.pem');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const DAY = 24 * 60 * 60 * 1000;

async function selfSigned(type: 'rsa' | 'ec'): Promise<{ cert: X509Certificate; key: KeyObject }> {
  const keys =
    type === 'rsa'
      ? generateKeyPairSync('rsa', { modulusLength: 2048 })
      : generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const cert = await issueCertificate({
    subject: 'localhost',
    keys,
    ca: false,
    notBefore: new Date(Date.now() - DAY),
    notAfter: new Date(Date.now() + 30 * DAY),
  });
  return { cert, key: keys.privateKey };
}

/** Caddy stores EC keys as SEC1 PEM ("EC PRIVATE KEY"); RSA as PKCS#8. */
function keyPem(key: KeyObject): string {
  return key.asymmetricKeyType === 'ec'
    ? (key.export({ type: 'sec1', format: 'pem' }) as string)
    : (key.export({ type: 'pkcs8', format: 'pem' }) as string);
}

async function writePair(
  pair: { cert: X509Certificate; key: KeyObject },
  chain = '',
): Promise<void> {
  await writeFile(certPath, pair.cert.toString() + chain);
  await writeFile(keyPath, keyPem(pair.key));
}

it('reads the certificate and the key', async () => {
  const pair = await selfSigned('ec');
  await writePair(pair);
  const identity = await new IdentityStore({ certPath, keyPath }).get();
  expect(identity.certificate.fingerprint256).toBe(pair.cert.fingerprint256);
  expect(identity.chain).toEqual([]);
  expect(identity.privateKey.asymmetricKeyType).toBe('ec');
});

it('keeps the rest of a full-chain file as the chain', async () => {
  const leaf = await selfSigned('rsa');
  const issuer = await selfSigned('ec');
  await writePair(leaf, issuer.cert.toString());
  const identity = await new IdentityStore({ certPath, keyPath }).get();
  expect(identity.certificate.fingerprint256).toBe(leaf.cert.fingerprint256);
  expect(identity.chain.map((c) => c.fingerprint256)).toEqual([issuer.cert.fingerprint256]);
});

it('caches while the files are unchanged', async () => {
  await writePair(await selfSigned('ec'));
  const store = new IdentityStore({ certPath, keyPath });
  expect(await store.get()).toBe(await store.get());
});

it('reloads identity when files change', async () => {
  const first = await selfSigned('ec');
  await writePair(first);
  const store = new IdentityStore({ certPath, keyPath });
  expect((await store.get()).certificate.fingerprint256).toBe(first.cert.fingerprint256);

  const second = await selfSigned('ec');
  await writePair(second);
  const later = new Date(Date.now() + 60_000);
  await utimes(certPath, later, later);
  await utimes(keyPath, later, later);
  expect((await store.get()).certificate.fingerprint256).toBe(second.cert.fingerprint256);
});

it('refuses a key that does not match the certificate, without echoing the key', async () => {
  const a = await selfSigned('ec');
  const b = await selfSigned('ec');
  await writeFile(certPath, a.cert.toString());
  const pem = keyPem(b.key);
  await writeFile(keyPath, pem);
  const error = await new IdentityStore({ certPath, keyPath }).get().catch((e: unknown) => e);
  expect(error).toBeInstanceOf(IdentityError);
  const body = pem.split('\n')[1] ?? '';
  expect(String((error as Error).message)).not.toContain(body);
});

it('names a missing file without reading anything', async () => {
  await expect(new IdentityStore({ certPath, keyPath }).get()).rejects.toBeInstanceOf(
    IdentityError,
  );
});
