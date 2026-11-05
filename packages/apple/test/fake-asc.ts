import { createServer } from 'node:http';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { createFakeAuthority } from './fake-crypto.ts';

type Failure = 'auth' | 'rate_limited' | 'no_slots' | 'cert_limit';
interface Resource {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships?: unknown;
}
interface SeedDevice {
  id: string;
  udid: string;
  name: string;
  deviceClass: string;
}
export interface FakeAsc {
  url: string;
  seedDevices(devices: SeedDevice[], identity?: { keyId: string; issuerId: string }): void;
  failNext(kind: Failure, identity?: { keyId: string; issuerId: string }): void;
  close(): Promise<void>;
}

// Synthetic responses for local tests. This service never contacts Apple or trusts real certificates.
export async function startFakeAsc(port: number): Promise<FakeAsc> {
  const accounts = new Map<
    string,
    {
      devices: Resource[];
      certificates: Resource[];
      bundles: Resource[];
      profiles: Resource[];
      failures: Failure[];
    }
  >();
  const account = (identity = { keyId: 'TESTKEY', issuerId: 'test-issuer' }) => {
    const key = JSON.stringify([identity.issuerId, identity.keyId]);
    let state = accounts.get(key);
    if (!state) {
      state = { devices: [], certificates: [], bundles: [], profiles: [], failures: [] };
      accounts.set(key, state);
    }
    return state;
  };
  let authority: ReturnType<typeof createFakeAuthority> | undefined;
  let nextId = 1;
  let origin = '';
  const server = createServer(async (req, res) => {
    const reply = (status: number, body?: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const fail = (status: number, detail: string, headers?: Record<string, string>) =>
      reply(
        status,
        {
          errors: [
            {
              id: 'test-error',
              status: String(status),
              code: 'SYNTHETIC_ERROR',
              title: 'Synthetic failure',
              detail,
            },
          ],
        },
        headers,
      );
    if (!req.headers.authorization?.startsWith('Bearer ')) {
      fail(401, 'Missing token');
      return;
    }
    let state: ReturnType<typeof account>;
    try {
      const jwt = req.headers.authorization.slice('Bearer '.length);
      const keyId = decodeProtectedHeader(jwt).kid;
      const issuerId = decodeJwt(jwt).iss;
      if (!keyId || !issuerId) throw new Error();
      state = account({ keyId, issuerId });
    } catch {
      fail(401, 'Invalid synthetic identity');
      return;
    }
    const { devices, certificates, bundles, profiles, failures } = state;
    const forced = failures.shift();
    if (forced) {
      const detail = {
        auth: 'Invalid credentials',
        rate_limited: 'Too many requests',
        no_slots: 'The maximum number of devices has been reached.',
        cert_limit: 'The maximum number of certificates has been reached.',
      }[forced];
      fail(
        forced === 'auth' ? 401 : forced === 'rate_limited' ? 429 : 409,
        detail,
        forced === 'rate_limited' ? { 'Retry-After': '30' } : undefined,
      );
      return;
    }
    try {
      const url = new URL(req.url ?? '/', origin);
      const collection = url.pathname.split('/')[2] ?? '';
      const id = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const store = { devices, certificates, bundleIds: bundles, profiles }[collection];
      if (!store) {
        fail(404, 'Not found');
        return;
      }
      if (req.method === 'GET') {
        let items = store;
        const udid = url.searchParams.get('filter[udid]');
        const identifier = url.searchParams.get('filter[identifier]');
        if (udid) items = items.filter((d) => d.attributes.udid === udid);
        if (identifier) items = items.filter((b) => b.attributes.identifier === identifier);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
        if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1) {
          fail(400, 'Invalid pagination');
          return;
        }
        const page = items.slice(offset, offset + limit);
        const nextUrl = new URL(url);
        nextUrl.searchParams.set('offset', String(offset + limit));
        reply(200, {
          data: page,
          links: {
            self: url.href,
            next: offset + limit < items.length ? `${nextUrl.pathname}${nextUrl.search}` : null,
          },
          meta: { paging: { total: items.length, limit } },
        });
        return;
      }
      if (req.method === 'DELETE' && collection === 'profiles') {
        const index = profiles.findIndex((profile) => profile.id === id);
        if (index < 0) {
          fail(404, 'Not found');
          return;
        }
        profiles.splice(index, 1);
        reply(204);
        return;
      }
      if (req.method !== 'POST' || id) {
        fail(404, 'Not found');
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65_536) {
          fail(413, 'Request too large');
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const { data } = JSON.parse(Buffer.concat(chunks).toString()) as { data: Resource };
      if (data?.type !== collection || !data.attributes) {
        fail(400, 'Invalid resource');
        return;
      }
      const attributes = data.attributes;
      if (collection === 'devices') {
        if (
          attributes.platform !== 'IOS' ||
          typeof attributes.udid !== 'string' ||
          typeof attributes.name !== 'string'
        ) {
          fail(400, 'Invalid device');
          return;
        }
        if (devices.some((device) => device.attributes.udid === attributes.udid)) {
          fail(409, 'Device already exists');
          return;
        }
        attributes.status = 'ENABLED';
        attributes.deviceClass = 'IPHONE';
      }
      if (collection === 'certificates') {
        if (
          attributes.certificateType !== 'DISTRIBUTION' ||
          typeof attributes.csrContent !== 'string'
        ) {
          fail(400, 'Invalid CSR');
          return;
        }
        authority ??= createFakeAuthority();
        const issued = authority.issueCertificate(attributes.csrContent);
        delete attributes.csrContent;
        attributes.certificateContent = issued.content;
        attributes.expirationDate = '2027-11-05T00:00:00Z';
        attributes.serialNumber = issued.serial;
      }
      if (
        collection === 'bundleIds' &&
        (attributes.platform !== 'IOS' || typeof attributes.identifier !== 'string')
      ) {
        fail(400, 'Invalid bundle');
        return;
      }
      if (collection === 'profiles') {
        const relationships = data.relationships as
          | {
              bundleId?: { data?: { type: string; id: string } };
              certificates?: { data?: { type: string; id: string }[] };
              devices?: { data?: { type: string; id: string }[] };
            }
          | undefined;
        const bundle = relationships?.bundleId?.data;
        const certs = relationships?.certificates?.data;
        const ds = relationships?.devices?.data;
        if (
          attributes.profileType !== 'IOS_APP_ADHOC' ||
          !bundle ||
          bundle.type !== 'bundleIds' ||
          !bundles.some((b) => b.id === bundle.id) ||
          certs?.length !== 1 ||
          certs.some(
            (c) => c.type !== 'certificates' || !certificates.some((s) => s.id === c.id),
          ) ||
          !ds?.length ||
          ds.some((d) => d.type !== 'devices' || !devices.some((s) => s.id === d.id))
        ) {
          fail(400, 'Invalid profile relationships');
          return;
        }
        authority ??= createFakeAuthority();
        const selectedCertificate = certificates.find((c) => c.id === certs[0]?.id);
        const selectedBundle = bundles.find((b) => b.id === bundle.id);
        attributes.profileContent = authority.profile({
          name: String(attributes.name),
          identifier: String(selectedBundle?.attributes.identifier),
          certificateBase64: String(selectedCertificate?.attributes.certificateContent),
          udids: ds.map((d) =>
            String(devices.find((device) => device.id === d.id)?.attributes.udid),
          ),
        });
        attributes.expirationDate = '2027-11-05T00:00:00Z';
      }
      const resource = { ...data, id: `fake-${nextId++}` };
      store.push(resource);
      reply(201, { data: resource, links: { self: `${url.href}/${resource.id}` } });
    } catch {
      fail(400, 'Invalid request');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fake ASC failed to listen');
  origin = `http://127.0.0.1:${address.port}`;
  return {
    url: origin,
    seedDevices: (input, identity) => {
      account(identity).devices.push(
        ...input.map(({ id, ...attributes }) => ({
          type: 'devices',
          id,
          attributes: { ...attributes, platform: 'IOS', status: 'ENABLED' },
        })),
      );
    },
    failNext: (kind, identity) => {
      account(identity).failures.push(kind);
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
