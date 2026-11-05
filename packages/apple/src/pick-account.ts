export interface PickableAccount {
  id: string;
  tier: 'standard' | 'reliable';
  status: 'active' | 'auth_error' | 'blocked';
  membershipExpiresAt: Date;
  deviceLimit: number;
  usedIphoneSlots: number;
  usedIpadSlots: number;
  certificates: { status: string; expiresAt: Date }[];
  createdAt: Date;
}
export interface AccountWant {
  tier: 'standard' | 'reliable';
  deviceClass: 'IPHONE' | 'IPAD';
  now: Date;
  minMembershipDays: number;
  exclude?: string[];
}
export function pickAccount(accounts: PickableAccount[], want: AccountWant): string | null {
  if (!Number.isFinite(want.minMembershipDays) || want.minMembershipDays < 0) return null;
  const threshold = want.now.getTime() + want.minMembershipDays * 86_400_000;
  const used = (account: PickableAccount) =>
    want.deviceClass === 'IPAD' ? account.usedIpadSlots : account.usedIphoneSlots;
  const eligible = accounts.filter(
    (account) =>
      account.status === 'active' &&
      account.tier === want.tier &&
      account.membershipExpiresAt.getTime() > threshold &&
      account.certificates.some(
        (cert) => cert.status === 'active' && cert.expiresAt.getTime() > want.now.getTime(),
      ) &&
      Number.isInteger(account.deviceLimit) &&
      account.deviceLimit > 0 &&
      account.deviceLimit <= 100 &&
      Number.isInteger(used(account)) &&
      used(account) >= 0 &&
      used(account) < account.deviceLimit &&
      !want.exclude?.includes(account.id),
  );
  eligible.sort(
    (a, b) =>
      used(b) - used(a) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
  return eligible[0]?.id ?? null;
}
export function deviceClassOf(product: string): 'IPHONE' | 'IPAD' {
  return product.startsWith('iPad') ? 'IPAD' : 'IPHONE';
}
