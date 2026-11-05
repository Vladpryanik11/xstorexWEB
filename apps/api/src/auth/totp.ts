import { Secret, TOTP } from 'otpauth';

const PERIOD = 30;
const CODE = /^\d{6}$/;

function totp(secret: string, label = 'admin'): TOTP {
  return new TOTP({
    issuer: 'Xstore',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
}

/** Returns the matched time step (window ±1), or null when the code does not match. */
export function verifyTotp(secret: string, code: string, now: Date): number | null {
  if (!CODE.test(code)) return null;
  const timestamp = now.getTime();
  const delta = totp(secret).validate({ token: code, timestamp, window: 1 });
  if (delta === null) return null;
  return Math.floor(timestamp / 1000 / PERIOD) + delta;
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpUri(secret: string, email: string): string {
  return totp(secret, email).toString();
}

/** Current code for a secret; used by the CLI self-check and tests. */
export function currentTotp(secret: string, now: Date = new Date()): string {
  return totp(secret).generate({ timestamp: now.getTime() });
}
