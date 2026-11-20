import { createHash } from 'node:crypto';
import { SigningError } from './errors.js';
import type { ParsedP12 } from './p12.js';
import type { MobileProvision } from './profile.js';

export { SigningError } from './errors.js';

/** What the site stores about an accepted kit (no secrets). */
export type KitFacts = {
  teamId: string;
  profileUuid: string;
  appIdPattern: string;
  /** Upper-case hex. */
  certSerial: string;
  /** Lower-case hex SHA-1 of the certificate DER. */
  certSha1: string;
  certNotAfter: Date;
  profileExpiresAt: Date;
};

/** A kit must stay valid at least this long after upload. */
export const MIN_REMAINING_MS = 24 * 3600_000;

/**
 * Checks that a supplier kit fits this device, in the order of the spec table (§5.2); the first
 * failure throws its code. OCSP is checked separately (`checkRevocation`). With `strict: false`
 * (owner's decision 2026-11-20) the kit is only read: device, certificate match and dates are not
 * checked.
 */
export function checkKit(input: {
  p12: ParsedP12;
  profile: MobileProvision;
  udid: string;
  now: Date;
  strict: boolean;
}): KitFacts {
  const { p12, profile, now } = input;
  const certSha1 = createHash('sha1').update(p12.certificate.raw).digest('hex');
  const certNotAfter = new Date(p12.certificate.validTo);
  if (input.strict) strictChecks(p12, profile, input.udid, certSha1, now);
  return {
    teamId: profile.teamId,
    profileUuid: profile.uuid,
    appIdPattern: profile.appIdPattern,
    certSerial: p12.certificate.serialNumber.toUpperCase(),
    certSha1,
    certNotAfter,
    profileExpiresAt: profile.expiresAt,
  };
}

function strictChecks(
  p12: ParsedP12,
  profile: MobileProvision,
  rawUdid: string,
  certSha1: string,
  now: Date,
): void {
  if (profile.allDevices) throw new SigningError('ALL_DEVICES_PROFILE');
  const udid = rawUdid.toUpperCase();
  if (!profile.devices.some((d) => d.toUpperCase() === udid)) {
    throw new SigningError('UDID_NOT_IN_PROFILE');
  }
  if (!profile.developerCertSha1.includes(certSha1)) throw new SigningError('CERT_NOT_IN_PROFILE');
  const certNotAfter = new Date(p12.certificate.validTo);
  const certNotBefore = new Date(p12.certificate.validFrom);
  const limit = now.getTime() + MIN_REMAINING_MS;
  if (
    certNotBefore.getTime() > now.getTime() ||
    certNotAfter.getTime() <= limit ||
    profile.expiresAt.getTime() <= limit
  ) {
    throw new SigningError('KIT_EXPIRED');
  }
}
