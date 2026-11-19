import { generateKeyPairSync, type KeyObject, X509Certificate } from 'node:crypto';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
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

async function selfSigned(
  type: 'rsa' | 'ec',
  validDays = 30,
): Promise<{ cert: X509Certificate; key: KeyObject }> {
  const keys =
    type === 'rsa'
      ? generateKeyPairSync('rsa', { modulusLength: 2048 })
      : generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const cert = await issueCertificate({
    subject: 'localhost',
    keys,
    ca: false,
    notBefore: new Date(Date.now() - 2 * DAY),
    notAfter: new Date(Date.now() + validDays * DAY),
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

it('wraps a read failure in IdentityError', async () => {
  await writePair(await selfSigned('ec'));
  await rm(keyPath);
  await mkdir(keyPath);
  const error = await new IdentityStore({ certPath, keyPath }).get().catch((e: unknown) => e);
  expect(error).toBeInstanceOf(IdentityError);
});

/** Marks both files as changed, as a renewal does. */
async function touch(): Promise<void> {
  const later = new Date(Date.now() + 60_000 + Math.random() * 60_000);
  await utimes(certPath, later, later);
  await utimes(keyPath, later, later);
}

it('keeps the last good identity while a renewal has written the certificate but not the key', async () => {
  const first = await selfSigned('ec');
  await writePair(first);
  const store = new IdentityStore({ certPath, keyPath });
  expect((await store.get()).certificate.fingerprint256).toBe(first.cert.fingerprint256);

  const second = await selfSigned('ec');
  await writeFile(certPath, second.cert.toString());
  await touch();
  expect((await store.get()).certificate.fingerprint256).toBe(first.cert.fingerprint256);

  // The key lands: the new pair is used from the next request on.
  await writeFile(keyPath, keyPem(second.key));
  await touch();
  expect((await store.get()).certificate.fingerprint256).toBe(second.cert.fingerprint256);
});

it('keeps the last good identity while a file is briefly missing or half written', async () => {
  const first = await selfSigned('ec');
  await writePair(first);
  const store = new IdentityStore({ certPath, keyPath });
  await store.get();
  await writeFile(keyPath, '-----BEGIN EC PRIVATE KEY-----\nAAAA');
  await touch();
  expect((await store.get()).certificate.fingerprint256).toBe(first.cert.fingerprint256);
  await rm(keyPath);
  expect((await store.get()).certificate.fingerprint256).toBe(first.cert.fingerprint256);
});

it('does not fall back to an expired identity', async () => {
  const old = await selfSigned('ec', -1);
  await writePair(old);
  const store = new IdentityStore({ certPath, keyPath });
  await store.get();
  const next = await selfSigned('ec');
  await writeFile(certPath, next.cert.toString());
  await touch();
  await expect(store.get()).rejects.toBeInstanceOf(IdentityError);
});

it('warns once per failed change while it keeps the last good identity, never with key material', async () => {
  const first = await selfSigned('ec');
  await writePair(first);
  const warnings: { message: string; reason: string }[] = [];
  const store = new IdentityStore({ certPath, keyPath }, (message, reason) =>
    warnings.push({ message, reason }),
  );
  await store.get();
  expect(warnings).toEqual([]);

  const second = await selfSigned('ec');
  await writeFile(certPath, second.cert.toString());
  await touch();
  await store.get();
  await store.get();
  expect(warnings).toEqual([
    {
      message: 'enrollment signer: new files not loaded, signing with the last good certificate',
      reason: 'Profile signing key does not match the certificate',
    },
  ]);

  // Another change that still fails warns again; the new pair loading ends the warnings.
  const pem = keyPem((await selfSigned('ec')).key);
  await writeFile(keyPath, pem);
  await touch();
  await store.get();
  expect(warnings).toHaveLength(2);
  await writeFile(keyPath, keyPem(second.key));
  await touch();
  expect((await store.get()).certificate.fingerprint256).toBe(second.cert.fingerprint256);
  expect(warnings).toHaveLength(2);
  const body = pem.split('\n')[1] ?? '';
  expect(JSON.stringify(warnings)).not.toContain(body);
  expect(JSON.stringify(warnings)).not.toContain(dir);
});
