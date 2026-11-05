import { AscError, classifyAscError } from './asc-errors.js';
import { type AscCredentials, signAscJwt } from './jwt.js';

export interface AscResource<T> {
  type: string;
  id: string;
  attributes: T;
}
export interface DeviceAttributes {
  udid: string;
  name: string;
  deviceClass?: string;
  status?: string;
  platform?: string;
  model?: string;
  addedDate?: string;
}
export interface CertificateAttributes {
  certificateType: string;
  certificateContent?: string;
  expirationDate?: string;
  serialNumber?: string;
  name?: string;
  displayName?: string;
  platform?: string;
}
export interface BundleAttributes {
  identifier: string;
  name: string;
  platform?: string;
  seedId?: string;
}
export type AscDevice = AscResource<DeviceAttributes>;
export type AscCertificate = AscResource<CertificateAttributes>;
export type AscBundleId = AscResource<BundleAttributes>;
export interface ProfileInput {
  name: string;
  bundleIdAscId: string;
  certificateAscId: string;
  deviceAscIds: string[];
}
export interface AscClient {
  listDevices(): Promise<AscDevice[]>;
  findDeviceByUdid(udid: string): Promise<AscDevice | null>;
  registerDevice(input: { name: string; udid: string }): Promise<AscDevice>;
  listCertificates(): Promise<AscCertificate[]>;
  createCertificate(csrPem: string): Promise<AscCertificate>;
  findBundleId(identifier: string): Promise<AscBundleId | null>;
  createWildcardBundleId(identifier?: '*' | 'ru.xstorex.*'): Promise<AscBundleId>;
  createAdHocProfile(
    input: ProfileInput,
  ): Promise<{ ascProfileId: string; profileContent: Buffer; expiresAt: Date }>;
  deleteProfile(id: string): Promise<void>;
}
export interface AscClientOptions extends AscCredentials {
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new AscError('other', 502);
}

function resource<T>(data: unknown, type: string, required: string[]): AscResource<T> {
  if (
    !record(data) ||
    data.type !== type ||
    typeof data.id !== 'string' ||
    !data.id ||
    !record(data.attributes)
  )
    return invalidResponse();
  const attributes = data.attributes;
  if (required.some((field) => typeof attributes[field] !== 'string')) return invalidResponse();
  return { type, id: data.id, attributes: attributes as T };
}

function retryAfter(header: string | null, now: Date): number | undefined {
  if (!header) return undefined;
  if (/^\d+$/.test(header)) {
    const seconds = Number(header);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }
  const milliseconds = Date.parse(header) - now.getTime();
  return Number.isFinite(milliseconds) ? Math.max(0, Math.ceil(milliseconds / 1000)) : undefined;
}

export function createAscClient(opts: AscClientOptions): AscClient {
  const base = new URL(opts.baseUrl ?? 'https://api.appstoreconnect.apple.com');
  const localTest =
    ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) &&
    ['http:', 'https:'].includes(base.protocol);
  if (
    (!localTest && base.origin !== 'https://api.appstoreconnect.apple.com') ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  ) {
    throw new Error('Для тестового Apple API разрешён только локальный адрес');
  }
  const fetchImpl = opts.fetch ?? fetch;
  const now = opts.now ?? (() => new Date());
  let cachedToken: { token: string; issuedAt: number } | undefined;
  async function token(): Promise<string> {
    const time = now().getTime();
    if (!cachedToken || time < cachedToken.issuedAt || time - cachedToken.issuedAt >= 840_000) {
      cachedToken = { token: await signAscJwt({ ...opts, now: new Date(time) }), issuedAt: time };
    }
    return cachedToken.token;
  }

  async function request(url: URL, method = 'GET', body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const bearer = await token();
      controller.signal.throwIfAborted();
      const response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${bearer}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
        redirect: 'error',
      });
      if (response.ok && method === 'DELETE' && response.status === 204) return undefined;
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AscError(
          classifyAscError(response.status, null),
          response.ok ? 502 : response.status,
          retryAfter(response.headers.get('retry-after'), now()),
        );
      }
      if (!response.ok)
        throw new AscError(
          classifyAscError(response.status, payload),
          response.status,
          retryAfter(response.headers.get('retry-after'), now()),
        );
      return payload;
    } catch (error) {
      if (error instanceof AscError) throw error;
      throw new AscError('other', 0);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function list<T>(
    type: string,
    fields: string[],
    filters: Record<string, string> = {},
  ): Promise<AscResource<T>[]> {
    let url: URL | null = new URL(`/v1/${type}`, base);
    url.searchParams.set('limit', '200');
    for (const [key, value] of Object.entries(filters))
      url.searchParams.set(`filter[${key}]`, value);
    const seen = new Set<string>();
    const items: AscResource<T>[] = [];
    while (url) {
      if (
        url.origin !== base.origin ||
        url.pathname !== `/v1/${type}` ||
        url.username ||
        url.password ||
        url.hash ||
        seen.has(url.href) ||
        seen.size >= 10_000
      )
        return invalidResponse();
      seen.add(url.href);
      const payload = await request(url);
      if (!record(payload) || !Array.isArray(payload.data)) return invalidResponse();
      for (const data of payload.data) items.push(resource<T>(data, type, fields));
      const links = payload.links;
      if (links !== undefined && !record(links)) return invalidResponse();
      const next = record(links) ? links.next : undefined;
      if (next !== undefined && next !== null && typeof next !== 'string') return invalidResponse();
      if (next) {
        try {
          url = new URL(next, url);
        } catch {
          return invalidResponse();
        }
      } else url = null;
    }
    return items;
  }

  async function create<T>(
    type: string,
    attributes: Record<string, unknown>,
    fields: string[],
    relationships?: unknown,
  ): Promise<AscResource<T>> {
    const payload = await request(new URL(`/v1/${type}`, base), 'POST', {
      data: { type, attributes, ...(relationships ? { relationships } : {}) },
    });
    if (!record(payload)) return invalidResponse();
    return resource<T>(payload.data, type, fields);
  }

  return {
    listDevices: () => list<DeviceAttributes>('devices', ['udid', 'name']),
    findDeviceByUdid: async (udid) =>
      (await list<DeviceAttributes>('devices', ['udid', 'name'], { udid })).find(
        (device) => device.attributes.udid === udid,
      ) ?? null,
    registerDevice: (input) =>
      create<DeviceAttributes>('devices', { ...input, platform: 'IOS' }, ['udid', 'name']),
    listCertificates: () => list<CertificateAttributes>('certificates', ['certificateType']),
    createCertificate: (csrPem) =>
      create<CertificateAttributes>(
        'certificates',
        { csrContent: csrPem, certificateType: 'DISTRIBUTION' },
        ['certificateType', 'certificateContent', 'expirationDate', 'serialNumber'],
      ),
    findBundleId: async (identifier) =>
      (await list<BundleAttributes>('bundleIds', ['identifier', 'name'], { identifier })).find(
        (bundle) => bundle.attributes.identifier === identifier,
      ) ?? null,
    createWildcardBundleId: (identifier = '*') =>
      create<BundleAttributes>(
        'bundleIds',
        { identifier, name: 'Xstore Wildcard', platform: 'IOS' },
        ['identifier', 'name'],
      ),
    createAdHocProfile: async (input) => {
      const profile = await create<{ profileContent: string; expirationDate: string }>(
        'profiles',
        { name: input.name, profileType: 'IOS_APP_ADHOC' },
        ['profileContent', 'expirationDate'],
        {
          bundleId: { data: { type: 'bundleIds', id: input.bundleIdAscId } },
          certificates: { data: [{ type: 'certificates', id: input.certificateAscId }] },
          devices: { data: input.deviceAscIds.map((id) => ({ type: 'devices', id })) },
        },
      );
      const expiresAt = new Date(profile.attributes.expirationDate);
      const profileContent = Buffer.from(profile.attributes.profileContent, 'base64');
      if (
        !Number.isFinite(expiresAt.getTime()) ||
        !profileContent.length ||
        profileContent.toString('base64') !== profile.attributes.profileContent
      )
        return invalidResponse();
      return { ascProfileId: profile.id, profileContent, expiresAt };
    },
    deleteProfile: async (id) => {
      await request(new URL(`/v1/profiles/${encodeURIComponent(id)}`, base), 'DELETE');
    },
  };
}
