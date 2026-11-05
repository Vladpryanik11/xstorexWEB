import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeAsc, startFakeAsc } from '../test/fake-asc.js';
import { createAscClient } from './asc-client.js';
import { AscError } from './asc-errors.js';

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
    const cert = await client.createCertificate('TEST CSR');
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
    expect(profile.profileContent.toString()).toBe('FAKE-PROFILE');
    expect(profile.expiresAt).toEqual(new Date('2027-11-05T00:00:00Z'));
    await client.deleteProfile(profile.ascProfileId);
    await expect(client.deleteProfile(profile.ascProfileId)).rejects.toMatchObject({
      kind: 'not_found',
      status: 404,
    });
  });

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
