import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import forge from 'node-forge';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeAsc, startFakeAsc } from '../test/fake-asc.js';
import { createAscClient } from './asc-client.js';
import { AscError } from './asc-errors.js';
import { buildP12, generateKeyAndCsr } from './keys.js';

const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const credentials = {
  keyId: 'TESTKEY',
  issuerId: 'test-issuer',
  privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
let fake: FakeAsc;

beforeEach(async () => {
  fake = await startFakeAsc(0);
});
afterEach(async () => {
  vi.useRealTimers();
  await fake.close();
});

describe('ASC HTTP client against a local service', () => {
  it('sends only the allowed device fields even when the input has private extra fields', async () => {
    let sent: unknown;
    const client = createAscClient({
      ...credentials,
      fetch: async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return Response.json({
          data: { type: 'devices', id: 'd', attributes: { name: 'xs-device', udid: 'TEST-UDID' } },
        });
      },
    });
    const deviceModel = {
      name: 'xs-device',
      udid: 'TEST-UDID',
      userId: 'private-user',
      privateKey: 'SENSITIVE-NOT-FOR-APPLE',
    };
    await client.registerDevice(deviceModel);
    expect(sent).toEqual({
      data: {
        type: 'devices',
        attributes: { name: 'xs-device', udid: 'TEST-UDID', platform: 'IOS' },
      },
    });
  });

  it('matches existing hex UDIDs across case and separator variants', async () => {
    fake.seedDevices([
      {
        id: 'existing',
        udid: '00008110-00ABCDEF12345678',
        name: 'xs-existing',
        deviceClass: 'IPHONE',
      },
    ]);
    const client = createAscClient({ ...credentials, baseUrl: fake.url });
    expect((await client.findDeviceByUdid('00008110-00abcdef12345678'))?.id).toBe('existing');
    expect((await client.findDeviceByUdid('0000811000ABCDEF12345678'))?.id).toBe('existing');
  });

  it('supports localhost pagination without changing origin', async () => {
    fake.seedDevices(
      Array.from({ length: 201 }, (_, i) => ({
        id: `d-${i}`,
        udid: `u-${i}`,
        name: `xs-${i}`,
        deviceClass: 'IPHONE',
      })),
    );
    const client = createAscClient({
      ...credentials,
      baseUrl: fake.url.replace('127.0.0.1', 'localhost'),
    });
    expect(await client.listDevices()).toHaveLength(201);
  });

  it('isolates devices and failures for different synthetic Apple accounts', async () => {
    const one = createAscClient({ ...credentials, baseUrl: fake.url });
    const two = createAscClient({ ...credentials, issuerId: 'another-team', baseUrl: fake.url });
    await one.registerDevice({ name: 'xs-one', udid: 'UDID-ONE' });
    expect(await two.listDevices()).toEqual([]);
    fake.failNext('auth');
    expect(await two.listDevices()).toEqual([]);
    await expect(one.listDevices()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('uses one 30-second deadline for all pages of a public operation', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const client = createAscClient({
      ...credentials,
      fetch: async () => {
        calls++;
        const page = calls;
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        return Response.json({
          data: [],
          links: { next: page === 1 ? '/v1/devices?offset=200' : null },
        });
      },
    });
    const pending = client.listDevices().then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error }),
    );
    await vi.waitFor(() => expect(calls).toBe(1));
    await vi.advanceTimersByTimeAsync(40_001);
    expect(await pending).toMatchObject({ ok: false, error: { kind: 'other', status: 0 } });
    expect(calls).toBe(2);
  });

  it('distinguishes an interrupted success body from complete malformed JSON', async () => {
    const interrupted = createAscClient({
      ...credentials,
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError('SENSITIVE-BODY-FAILURE'));
            },
          }),
        ),
    });
    await expect(interrupted.listDevices()).rejects.toMatchObject({ kind: 'other', status: 0 });
    const invalid = createAscClient({
      ...credentials,
      fetch: async () => new Response('not-json'),
    });
    await expect(invalid.listDevices()).rejects.toMatchObject({ kind: 'other', status: 502 });
  });
  it('pages through 450 devices and finds an existing UDID', async () => {
    fake.seedDevices(
      Array.from({ length: 450 }, (_, i) => ({
        id: `device-${i}`,
        udid: `UDID-${i}`,
        name: `xs-${i}`,
        deviceClass: 'IPHONE',
      })),
    );
    const client = createAscClient({ ...credentials, baseUrl: fake.url });
    const devices = await client.listDevices();
    expect(devices).toHaveLength(450);
    expect(devices[449]?.attributes.udid).toBe('UDID-449');
    expect((await client.findDeviceByUdid('UDID-321'))?.id).toBe('device-321');
    expect(await client.findDeviceByUdid('absent')).toBeNull();
  });

  it('registers a device and classifies duplicate and quota errors', async () => {
    const client = createAscClient({ ...credentials, baseUrl: fake.url });
    const device = await client.registerDevice({ name: 'xs-device01', udid: 'TEST-DEVICE' });
    expect(device.attributes).toMatchObject({
      name: 'xs-device01',
      udid: 'TEST-DEVICE',
      platform: 'IOS',
    });
    await expect(
      client.registerDevice({ name: 'xs-device01', udid: 'TEST-DEVICE' }),
    ).rejects.toMatchObject({ kind: 'already_exists', status: 409 });
    fake.failNext('no_slots');
    await expect(client.registerDevice({ name: 'xs-next', udid: 'NEXT' })).rejects.toMatchObject({
      kind: 'no_slots',
    });
  });

  it('creates certificates, bundle ids and Ad Hoc profiles using Apple relationships', async () => {
    const client = createAscClient({ ...credentials, baseUrl: fake.url });
    const identity = generateKeyAndCsr('Тестовый аккаунт');
    const cert = await client.createCertificate(identity.csrPem);
    expect(
      new X509Certificate(Buffer.from(cert.attributes.certificateContent ?? '', 'base64')).subject,
    ).toContain('Тестовый аккаунт');
    const p12 = buildP12({
      privateKeyPem: identity.privateKeyPem,
      certificateDer: Buffer.from(cert.attributes.certificateContent ?? '', 'base64'),
      password: 'test-password',
    });
    expect(
      forge.pkcs12.pkcs12FromAsn1(
        forge.asn1.fromDer(p12.toString('binary')),
        true,
        'test-password',
      ),
    ).toBeDefined();
    expect(cert.attributes.certificateType).toBe('DISTRIBUTION');
    expect((await client.listCertificates()).map((c) => c.id)).toContain(cert.id);
    expect(await client.findBundleId('*')).toBeNull();
    const bundle = await client.createWildcardBundleId();
    expect((await client.findBundleId('*'))?.id).toBe(bundle.id);
    const device = await client.registerDevice({ name: 'xs-profile', udid: 'PROFILE-DEVICE' });
    const profile = await client.createAdHocProfile({
      name: 'Xstore AdHoc r1',
      bundleIdAscId: bundle.id,
      certificateAscId: cert.id,
      deviceAscIds: [device.id],
    });
    const cms = forge.asn1.fromDer(profile.profileContent.toString('binary'));
    const octets = (node: forge.asn1.Asn1): string[] =>
      typeof node.value === 'string'
        ? node.type === forge.asn1.Type.OCTETSTRING
          ? [node.value]
          : []
        : node.value.flatMap(octets);
    const content = octets(cms).find((value) => value.startsWith('<?xml'));
    expect(content).toContain('<string>PROFILE-DEVICE</string>');
    expect(content).toContain('<key>DeveloperCertificates</key>');
    expect(content).toContain(cert.attributes.certificateContent);
    expect(profile.expiresAt).toEqual(new Date('2027-11-05T00:00:00Z'));
    await client.deleteProfile(profile.ascProfileId);
    await expect(client.deleteProfile(profile.ascProfileId)).rejects.toMatchObject({
      kind: 'not_found',
      status: 404,
    });
  }, 15_000);

  it('allows the explicit wildcard fallback without silently changing app identities', async () => {
    const client = createAscClient({ ...credentials, baseUrl: fake.url });
    const bundle = await client.createWildcardBundleId('ru.xstorex.*');
    expect(bundle.attributes.identifier).toBe('ru.xstorex.*');
  });

  it.each(['auth', 'rate_limited', 'cert_limit'] as const)(
    'preserves actionable %s failures without retrying writes',
    async (kind) => {
      fake.failNext(kind);
      const client = createAscClient({ ...credentials, baseUrl: fake.url });
      await expect(client.listCertificates()).rejects.toMatchObject({
        kind,
        ...(kind === 'rate_limited' ? { retryAfterSec: 30 } : {}),
      });
      expect(await client.listCertificates()).toEqual([]);
    },
  );

  it('does not follow hostile pagination or leak a bearer token to another host', async () => {
    let calls = 0;
    const client = createAscClient({
      ...credentials,
      fetch: async () => {
        calls++;
        return Response.json({ data: [], links: { next: 'https://untrusted.invalid/v1/devices' } });
      },
    });
    await expect(client.listDevices()).rejects.toBeInstanceOf(AscError);
    expect(calls).toBe(1);
  });

  it('rejects repeated pagination links instead of looping', async () => {
    const client = createAscClient({
      ...credentials,
      fetch: async () => Response.json({ data: [], links: { next: '/v1/devices?limit=200' } }),
    });
    await expect(client.listDevices()).rejects.toMatchObject({ kind: 'other' });
  });

  it('sanitizes errors from non-JSON responses and transport failures', async () => {
    const client = createAscClient({
      ...credentials,
      fetch: async () => new Response('SENSITIVE-RESPONSE', { status: 502 }),
    });
    await expect(client.listDevices()).rejects.toMatchObject({ kind: 'other', status: 502 });
    const broken = createAscClient({
      ...credentials,
      fetch: async () => {
        throw new Error('SENSITIVE-TRANSPORT');
      },
    });
    await expect(broken.listDevices()).rejects.toThrow('Не удалось выполнить запрос к Apple');
  });

  it('rejects malformed success responses rather than returning unsafe data', async () => {
    const client = createAscClient({
      ...credentials,
      fetch: async () =>
        Response.json({ data: [{ type: 'devices', id: 'd', attributes: { name: 'x' } }] }),
    });
    await expect(client.listDevices()).rejects.toMatchObject({ kind: 'other' });
  });

  it('aborts a request after 30 seconds', async () => {
    vi.useFakeTimers();
    const client = createAscClient({
      ...credentials,
      fetch: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('abort')), { once: true });
        }),
    });
    const pending = expect(client.listDevices()).rejects.toMatchObject({
      kind: 'other',
      status: 0,
    });
    await vi.advanceTimersByTimeAsync(30_001);
    await pending;
  });

  it('rejects untrusted API base URLs', () => {
    expect(() =>
      createAscClient({ ...credentials, baseUrl: 'https://untrusted.invalid' }),
    ).toThrow();
    expect(() =>
      createAscClient({ ...credentials, baseUrl: 'http://localhost:3199/escape' }),
    ).toThrow();
  });

  it('requests no redirects and handles HTTP-date Retry-After', async () => {
    const client = createAscClient({
      ...credentials,
      now: () => new Date('2026-11-05T09:00:00Z'),
      fetch: async (_url, init) => {
        expect(init?.redirect).toBe('error');
        return Response.json(
          { errors: [] },
          { status: 429, headers: { 'Retry-After': 'Thu, 05 Nov 2026 09:01:00 GMT' } },
        );
      },
    });
    await expect(client.listDevices()).rejects.toMatchObject({ retryAfterSec: 60 });
  });
});
