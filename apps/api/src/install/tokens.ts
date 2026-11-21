import { createHash, randomBytes } from 'node:crypto';

/** A one-time install token: 32 random bytes, base64url; only its SHA-256 is stored. */
export function newInstallToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInstallToken(token) };
}

export const hashInstallToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** iOS may fetch the manifest twice; the same client gets it again within this window. */
export const REFETCH_WINDOW_MS = 120_000;
export const TOKEN_TTL_MS = 3600_000;
export const IPA_LINK_TTL_SEC = 15 * 60;

/** Whether a used token may serve the manifest again to this client now. */
export function mayRefetch(
  used: { usedAt: Date; usedIp: string | null; usedUa: string | null },
  client: { ip: string | null; ua: string | null },
  now: Date,
): boolean {
  return (
    now.getTime() - used.usedAt.getTime() <= REFETCH_WINDOW_MS &&
    used.usedIp === client.ip &&
    used.usedUa === client.ua
  );
}
