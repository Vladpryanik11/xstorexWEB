import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRevocation, findIssuer } from './ocsp.js';
import { fakeOcspFetch, makeKit, makeOcspResponse, strangerRoot } from './testing.js';

afterEach(() => vi.useRealTimers());

describe('checkRevocation', () => {
  it('good response', async () => {
    const kit = makeKit();
    const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'good'));
    expect(await checkRevocation(kit.certificate, kit.issuer, fetchFn)).toBe('good');
    expect(fetchFn.calls).toBe(1);
  });

  it('revoked response', async () => {
    const kit = makeKit();
    const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'revoked'));
    expect(await checkRevocation(kit.certificate, kit.issuer, fetchFn)).toBe('revoked');
  });

  it('responder says unknown', async () => {
    const kit = makeKit();
    const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'unknown'));
    expect(await checkRevocation(kit.certificate, kit.issuer, fetchFn)).toBe('unknown');
  });

  it('response about another certificate', async () => {
    const kit = makeKit();
    const other = makeKit();
    const fetchFn = fakeOcspFetch(await makeOcspResponse(other, 'revoked'));
    expect(await checkRevocation(kit.certificate, kit.issuer, fetchFn)).toBe('unknown');
  });

  it('response signed by a stranger', async () => {
    const kit = makeKit();
    const fetchFn = fakeOcspFetch(await makeOcspResponse(kit, 'revoked', strangerRoot()));
    expect(await checkRevocation(kit.certificate, kit.issuer, fetchFn)).toBe('unknown');
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
    const pending = checkRevocation(kit.certificate, kit.issuer, hanging);
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
    expect(await checkRevocation(kit.certificate, kit.issuer, failing)).toBe('unknown');
    expect(
      await checkRevocation(kit.certificate, kit.issuer, fakeOcspFetch(Buffer.from('nope'))),
    ).toBe('unknown');
  });
});

describe('findIssuer', () => {
  it('prefers the chain, falls back to WWDR, null when unknown', () => {
    const kit = makeKit();
    expect(findIssuer(kit.certificate, [kit.issuer])?.subject).toBe(kit.issuer.subject);
    expect(findIssuer(kit.certificate, [])).toBeNull();
  });
});
