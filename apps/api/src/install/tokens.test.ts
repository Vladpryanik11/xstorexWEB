import { describe, expect, it } from 'vitest';
import { hashInstallToken, mayRefetch, newInstallToken } from './tokens.js';

describe('install tokens', () => {
  it('stores only a hash of a long random token', () => {
    const a = newInstallToken();
    const b = newInstallToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.hash).toBe(hashInstallToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });

  it('lets the same client fetch the manifest again for 120 seconds', () => {
    const used = { usedAt: new Date('2026-11-21T10:00:00Z'), usedIp: '1.2.3.4', usedUa: 'iOS' };
    const client = { ip: '1.2.3.4', ua: 'iOS' };
    expect(mayRefetch(used, client, new Date('2026-11-21T10:01:59Z'))).toBe(true);
    expect(mayRefetch(used, client, new Date('2026-11-21T10:02:01Z'))).toBe(false);
    expect(mayRefetch(used, { ...client, ua: 'Other' }, new Date('2026-11-21T10:00:10Z'))).toBe(
      false,
    );
    expect(mayRefetch(used, { ...client, ip: '5.6.7.8' }, new Date('2026-11-21T10:00:10Z'))).toBe(
      false,
    );
  });
});
