import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRevocation, findIssuer } from './ocsp.js';
import {
  fakeOcspFetch,
  makeKit,
  makeOcspResponse,
  strangerRoot,
  TEST_OCSP_HOST,
} from './testing.js';

const HOSTS = [TEST_OCSP_HOST];
const HOUR = 3600_000;

afterEach(() => vi.useRealTimers());

describe('checkRevocation', () => {
  it('good response', async () => {
    const kit = makeKit();
    const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'good'));
    expect(
      await checkRevocation(kit.certificate, kit.issuer, { fetchFn: fetchFn, allowedHosts: HOSTS }),
    ).toBe('good');
    expect(fetchFn.calls).toBe(1);
  });

  it('revoked response', async () => {
    const kit = makeKit();
    const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'revoked'));
    expect(
      await checkRevocation(kit.certificate, kit.issuer, { fetchFn: fetchFn, allowedHosts: HOSTS }),
    ).toBe('revoked');
  });

  it('responder says unknown', async () => {
    const kit = makeKit();
    const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'unknown'));
    expect(
      await checkRevocation(kit.certificate, kit.issuer, { fetchFn: fetchFn, allowedHosts: HOSTS }),
    ).toBe('unknown');
  });

  it('response about another certificate', async () => {
    const kit = makeKit();
    const other = makeKit();
    const fetchFn = fakeOcspFetch(await makeOcspResponse(other, 'revoked'));
    expect(
      await checkRevocation(kit.certificate, kit.issuer, { fetchFn: fetchFn, allowedHosts: HOSTS }),
    ).toBe('unknown');
  });

  it('response signed by a stranger', async () => {
    const kit = makeKit();
    const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'revoked', strangerRoot()));
    expect(
      await checkRevocation(kit.certificate, kit.issuer, { fetchFn: fetchFn, allowedHosts: HOSTS }),
    ).toBe('unknown');
  });

  it('timeout after 10 s', async () => {
    const kit = makeKit();
    let aborted = false;
    let called = false;
    const hanging = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        called = true;
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      })) as typeof fetch;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = checkRevocation(kit.certificate, kit.issuer, {
      fetchFn: hanging,
      allowedHosts: HOSTS,
    });
    // Real time passes while WebCrypto builds the request; only then the clock is moved.
    while (!called) await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await pending).toBe('unknown');
    expect(aborted).toBe(true);
  });

  it('fetch error or garbage body', async () => {
    const kit = makeKit();
    const failing = (async () => {
      throw new Error('network');
    }) as typeof fetch;
    expect(
      await checkRevocation(kit.certificate, kit.issuer, { fetchFn: failing, allowedHosts: HOSTS }),
    ).toBe('unknown');
    expect(
      await checkRevocation(kit.certificate, kit.issuer, {
        fetchFn: fakeOcspFetch(Buffer.from('nope')),
        allowedHosts: HOSTS,
      }),
    ).toBe('unknown');
  });
});

describe('checkRevocation freshness and limits', () => {
  it('stale response without nextUpdate (older than 7 days)', async () => {
    const kit = makeKit();
    const body = await makeOcspResponse(kit, 'good', undefined, {
      thisUpdate: new Date(Date.now() - 8 * 24 * HOUR),
      nextUpdate: null,
    });
    expect(
      await checkRevocation(kit.certificate, kit.issuer, {
        fetchFn: fakeOcspFetch(body),
        allowedHosts: HOSTS,
      }),
    ).toBe('unknown');
  });

  it('nextUpdate already passed', async () => {
    const kit = makeKit();
    const body = await makeOcspResponse(kit, 'good', undefined, {
      thisUpdate: new Date(Date.now() - 2 * 24 * HOUR),
      nextUpdate: new Date(Date.now() - HOUR),
    });
    expect(
      await checkRevocation(kit.certificate, kit.issuer, {
        fetchFn: fakeOcspFetch(body),
        allowedHosts: HOSTS,
      }),
    ).toBe('unknown');
  });

  it('thisUpdate in the future', async () => {
    const kit = makeKit();
    const body = await makeOcspResponse(kit, 'revoked', undefined, {
      thisUpdate: new Date(Date.now() + HOUR),
    });
    expect(
      await checkRevocation(kit.certificate, kit.issuer, {
        fetchFn: fakeOcspFetch(body),
        allowedHosts: HOSTS,
      }),
    ).toBe('unknown');
  });

  it('responder host outside the allow-list is never contacted', async () => {
    const kit = makeKit({ ocspUrl: 'http://169.254.169.254/latest' });
    const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'good'));
    expect(
      await checkRevocation(kit.certificate, kit.issuer, { fetchFn, allowedHosts: HOSTS }),
    ).toBe('unknown');
    expect(await checkRevocation(kit.certificate, kit.issuer, { fetchFn })).toBe('unknown');
    expect(fetchFn.calls).toBe(0);
  });

  it('issuer that did not issue the certificate: no request', async () => {
    const kit = makeKit();
    const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'good'));
    expect(
      await checkRevocation(kit.certificate, kit.certificate, { fetchFn, allowedHosts: HOSTS }),
    ).toBe('unknown');
    expect(fetchFn.calls).toBe(0);
  });

  it('a response over 64 KB is cut off while streaming', async () => {
    const kit = makeKit();
    let pulled = 0;
    const fetchFn = (async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            pulled += 1;
            controller.enqueue(new Uint8Array(16 * 1024));
            if (pulled > 100) controller.close();
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    expect(
      await checkRevocation(kit.certificate, kit.issuer, { fetchFn, allowedHosts: HOSTS }),
    ).toBe('unknown');
    expect(pulled).toBeLessThan(10);
  });
});

describe('findIssuer', () => {
  it('prefers the chain, falls back to WWDR, null when unknown', () => {
    const kit = makeKit();
    expect(findIssuer(kit.certificate, [kit.issuer])?.subject).toBe(kit.issuer.subject);
    expect(findIssuer(kit.certificate, [])).toBeNull();
  });
});
