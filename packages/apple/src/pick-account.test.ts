import { describe, expect, it } from 'vitest';
import { deviceClassOf, type PickableAccount, pickAccount } from './pick-account.js';

const now = new Date('2026-11-05T09:00:00Z');
const want = {
  tier: 'standard' as const,
  deviceClass: 'IPHONE' as const,
  now,
  minMembershipDays: 7,
};
const account = (
  id: string,
  used: number,
  overrides: Partial<PickableAccount> = {},
): PickableAccount => ({
  id,
  tier: 'standard',
  status: 'active',
  membershipExpiresAt: new Date('2027-01-01'),
  deviceLimit: 100,
  usedIphoneSlots: used,
  usedIpadSlots: 0,
  certificates: [{ status: 'active', expiresAt: new Date('2027-01-01') }],
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

describe('account selection', () => {
  it('fills the fullest eligible account first without mutating the input', () => {
    const accounts = [account('a', 40), account('b', 99), account('c', 100)];
    expect(pickAccount(accounts, want)).toBe('b');
    expect(accounts.map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });
  it('uses the oldest account when slot counts tie', () => {
    expect(
      pickAccount(
        [account('new', 5, { createdAt: new Date('2026-02-01') }), account('old', 5)],
        want,
      ),
    ).toBe('old');
  });
  it.each([
    { status: 'blocked' },
    { status: 'auth_error' },
    { tier: 'reliable' },
    { certificates: [] },
    { certificates: [{ status: 'revoked', expiresAt: new Date('2027-01-01') }] },
    { certificates: [{ status: 'active', expiresAt: now }] },
    { membershipExpiresAt: new Date('2026-11-12T09:00:00Z') },
    { membershipExpiresAt: new Date('invalid') },
    { deviceLimit: 0 },
    { deviceLimit: 101 },
  ] satisfies Partial<PickableAccount>[])('skips ineligible accounts: %j', (override) => {
    expect(pickAccount([account('ineligible', 99, override), account('ok', 2)], want)).toBe('ok');
  });
  it('excludes a failed account and returns null when none qualify', () => {
    expect(pickAccount([account('a', 4)], { ...want, exclude: ['a'] })).toBeNull();
    expect(pickAccount([], want)).toBeNull();
  });
  it('counts iPad slots separately from iPhone slots', () => {
    expect(
      pickAccount([account('a', 100, { usedIpadSlots: 99 })], { ...want, deviceClass: 'IPAD' }),
    ).toBe('a');
    expect(
      pickAccount([account('a', 0, { usedIpadSlots: 100 })], { ...want, deviceClass: 'IPAD' }),
    ).toBeNull();
  });
  it.each([
    ['iPad13,1', 'IPAD'],
    ['iPhone15,2', 'IPHONE'],
    ['unknown', 'IPHONE'],
  ])('classifies %s as %s', (product, expected) => {
    expect(deviceClassOf(product)).toBe(expected);
  });
});
