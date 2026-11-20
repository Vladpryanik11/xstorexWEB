import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { parseP12 } from './p12.js';
import { readProfile } from './profile.js';
import { makeKit, sha1Hex, TEST_TEAM_ID, TEST_UDID } from './testing.js';
import { checkKit, SigningError } from './validate.js';

const DAY = 24 * 3600_000;

async function check(kit: ReturnType<typeof makeKit>, udid = TEST_UDID, now = new Date()) {
  return checkKit({
    p12: await parseP12(kit.p12, kit.password),
    profile: readProfile(kit.profileXml),
    udid,
    now,
  });
}

async function codeOf(fn: () => unknown): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof SigningError) return err.code;
    throw err;
  }
  return 'OK';
}

describe('checkKit', () => {
  it('valid kit gives facts', async () => {
    const kit = makeKit();
    const facts = await check(kit);
    expect(facts).toMatchObject({
      teamId: TEST_TEAM_ID,
      appIdPattern: `${TEST_TEAM_ID}.*`,
      profileUuid: '0B6E1F0C-3D8A-4A43-9F7B-5D2B8E6C1A77',
      certSha1: sha1Hex(kit.certificate.raw),
      certSerial: kit.certificate.serialNumber.toUpperCase(),
    });
    expect(facts.certNotAfter.getTime()).toBe(new Date(kit.certificate.validTo).getTime());
    expect(facts.profileExpiresAt.getTime()).toBeGreaterThan(Date.now() + 200 * DAY);
  });

  it('udid is compared without case', async () => {
    expect(await codeOf(() => check(makeKit(), TEST_UDID.toLowerCase()))).toBe('OK');
  });

  it('profile without this udid is refused', async () => {
    expect(await codeOf(() => check(makeKit({ udids: ['00008110-FFFFFFFFFFFFFFFF'] })))).toBe(
      'UDID_NOT_IN_PROFILE',
    );
  });

  it('cert from another order', async () => {
    expect(await codeOf(() => check(makeKit({ otherCert: true })))).toBe('CERT_NOT_IN_PROFILE');
  });

  it('expires within a day', async () => {
    expect(
      await codeOf(() => check(makeKit({ notAfter: new Date(Date.now() + 23 * 3600_000) }))),
    ).toBe('KIT_EXPIRED');
  });

  it('accepts a profile for one app and keeps its app id', async () => {
    for (const appId of [`${TEST_TEAM_ID}.ru.app`, `${TEST_TEAM_ID}.ru.*`]) {
      const facts = await check(makeKit({ appId }));
      expect(facts.appIdPattern).toBe(appId);
    }
  });

  it('ProvisionsAllDevices', async () => {
    expect(await codeOf(() => check(makeKit({ allDevices: true })))).toBe('ALL_DEVICES_PROFILE');
  });
});

describe('parseP12', () => {
  it('wrong password', async () => {
    const kit = makeKit();
    expect(await codeOf(() => parseP12(kit.p12, 'nope'))).toBe('P12_INVALID');
  });

  it('garbage bytes', async () => {
    expect(await codeOf(() => parseP12(Buffer.from('not a p12'), ''))).toBe('P12_INVALID');
  });

  it('password is used verbatim', async () => {
    const kit = makeKit({ password: ' пароль 1 ' });
    expect(
      (await parseP12(kit.p12, ' пароль 1 ')).certificate.raw.equals(kit.certificate.raw),
    ).toBe(true);
    expect(await codeOf(() => parseP12(kit.p12, 'пароль 1'))).toBe('P12_INVALID');
    const empty = makeKit({ password: '' });
    expect((await parseP12(empty.p12, '')).certificate.raw.equals(empty.certificate.raw)).toBe(
      true,
    );
  });

  it('opens an OpenSSL 3 default p12 (AES-256, SHA-256 MAC) with a Cyrillic password', async () => {
    const kit = makeKit();
    const parsed = await parseP12(kit.p12, kit.password);
    const dir = mkdtempSync(join(tmpdir(), 'p12-'));
    writeFileSync(join(dir, 'cert.pem'), kit.certificate.toString());
    writeFileSync(join(dir, 'key.pem'), parsed.privateKeyPem);
    execFileSync('openssl', [
      'pkcs12',
      '-export',
      '-in',
      join(dir, 'cert.pem'),
      '-inkey',
      join(dir, 'key.pem'),
      '-out',
      join(dir, 'out.p12'),
      '-passout',
      'pass:пароль',
    ]);
    const reopened = await parseP12(readFileSync(join(dir, 'out.p12')), 'пароль');
    expect(reopened.certificate.raw.equals(kit.certificate.raw)).toBe(true);
    expect(forge.pki.privateKeyFromPem(reopened.privateKeyPem)).toBeTruthy();
    const empty = join(dir, 'empty.p12');
    execFileSync('openssl', [
      'pkcs12',
      '-export',
      '-in',
      join(dir, 'cert.pem'),
      '-inkey',
      join(dir, 'key.pem'),
      '-out',
      empty,
      '-passout',
      'pass:',
    ]);
    expect(
      (await parseP12(readFileSync(empty), '')).certificate.raw.equals(kit.certificate.raw),
    ).toBe(true);
    expect(await codeOf(() => parseP12(readFileSync(join(dir, 'out.p12')), 'пароль2'))).toBe(
      'P12_INVALID',
    );
  });

  it('refuses a password with a line break', async () => {
    const kit = makeKit();
    expect(await codeOf(() => parseP12(kit.p12, `${kit.password}\n`))).toBe('P12_INVALID');
  });

  it('carries the chain', async () => {
    const kit = makeKit();
    const parsed = await parseP12(kit.p12, kit.password);
    expect(parsed.chain.map((c) => c.subject)).toEqual([kit.issuer.subject]);
  });
});

describe('readProfile', () => {
  it('garbage bytes', async () => {
    expect(await codeOf(() => readProfile(Buffer.from('<plist>broken')))).toBe('PROFILE_INVALID');
  });

  it('reads devices and certificates', async () => {
    const kit = makeKit({ udids: ['A', 'B'] });
    const profile = readProfile(kit.profileXml);
    expect(profile.devices).toEqual(['A', 'B']);
    expect(profile.allDevices).toBe(false);
    expect(profile.developerCertSha1).toEqual([sha1Hex(kit.certificate.raw)]);
  });
});
