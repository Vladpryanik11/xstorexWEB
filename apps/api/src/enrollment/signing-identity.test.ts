import { createPrivateKey } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  certPem,
  createTestCa,
  keyPem,
  testIdentity,
} from '../../test/helpers/enrollment-identity.js';
import { CmsError, signCms, verifyCms } from './cms.js';
import { loadSigningIdentity } from './signing-identity.js';

let root: Awaited<ReturnType<typeof createTestCa>>;
let rsa: Awaited<ReturnType<typeof testIdentity>>;
let ec: typeof rsa;
let dir: string;
let certPath: string;
let keyPath: string;
beforeAll(async () => {
  root = await createTestCa();
  rsa = await testIdentity('RSA', root);
  ec = await testIdentity('ECDSA', root);
});
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'xstore-identity-test-'));
  certPath = join(dir, 'chain.pem');
  keyPath = join(dir, 'key.pem');
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});
async function save(identity: typeof rsa) {
  await writeFile(certPath, certPem(identity.certificate) + certPem(root.certificate));
  await writeFile(keyPath, await keyPem(identity.privateKey));
}

describe('signing identity loader', () => {
  it.each(['RSA', 'ECDSA'] as const)(
    'loads %s PEM keys and preserves the certificate chain',
    async (kind) => {
      await save(kind === 'RSA' ? rsa : ec);
      const identity = await loadSigningIdentity(certPath, keyPath);
      expect(identity.chain).toHaveLength(1);
      expect(identity.privateKey.extractable).toBe(false);
      const result = await verifyCms(await signCms(Buffer.from('profile'), identity), {
        anchors: [root.certificate],
      });
      expect(result.content.toString()).toBe('profile');
    },
  );

  it('loads traditional RSA and EC PEM formats used by TLS certificates', async () => {
    for (const identity of [rsa, ec]) {
      await save(identity);
      const key = createPrivateKey(await keyPem(identity.privateKey));
      await writeFile(
        keyPath,
        key.export({ format: 'pem', type: identity === rsa ? 'pkcs1' : 'sec1' }),
      );
      const loaded = await loadSigningIdentity(certPath, keyPath);
      expect(
        (
          await verifyCms(await signCms(Buffer.from('TLS'), loaded), {
            anchors: [root.certificate],
          })
        ).content.toString(),
      ).toBe('TLS');
      // Each path identifies a cache entry; use a fresh path for the other identity.
      keyPath = join(dir, 'other-key.pem');
    }
  });

  it('refreshes a renewed certificate after exactly one hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
    await save(rsa);
    const first = await loadSigningIdentity(certPath, keyPath);
    await save(ec);
    vi.setSystemTime(new Date('2026-11-05T12:59:59.999Z'));
    expect(await loadSigningIdentity(certPath, keyPath)).toBe(first);
    vi.setSystemTime(new Date('2026-11-05T13:00:00Z'));
    const renewed = await loadSigningIdentity(certPath, keyPath);
    expect(renewed.certificate.serialNumber.isEqual(ec.certificate.serialNumber)).toBe(true);
  });

  it('does not retain failed loads and can retry corrected files', async () => {
    await expect(loadSigningIdentity(certPath, keyPath)).rejects.toThrow(CmsError);
    await save(rsa);
    expect(
      (await loadSigningIdentity(certPath, keyPath)).certificate.serialNumber.isEqual(
        rsa.certificate.serialNumber,
      ),
    ).toBe(true);
  });

  it('fails closed when a refresh fails, then retries the repaired certificate', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
    await save(rsa);
    await loadSigningIdentity(certPath, keyPath);
    await writeFile(keyPath, 'broken renewal');
    vi.setSystemTime(new Date('2026-11-05T13:00:00Z'));
    await expect(loadSigningIdentity(certPath, keyPath)).rejects.toThrow(CmsError);
    await save(ec);
    expect(
      (await loadSigningIdentity(certPath, keyPath)).certificate.serialNumber.isEqual(
        ec.certificate.serialNumber,
      ),
    ).toBe(true);
  });

  it('rejects a private key that does not match the leaf certificate', async () => {
    await save(rsa);
    await writeFile(keyPath, await keyPem(root.privateKey));
    await expect(loadSigningIdentity(certPath, keyPath)).rejects.toThrow(CmsError);
  });

  it('rejects malformed certificate/key files without including their contents in the error', async () => {
    await writeFile(certPath, 'PRIVATE certificate input');
    await writeFile(keyPath, 'PRIVATE key input');
    await expect(loadSigningIdentity(certPath, keyPath)).rejects.toThrow(CmsError);
    await expect(loadSigningIdentity(certPath, keyPath)).rejects.not.toThrow('PRIVATE');
  });
});
