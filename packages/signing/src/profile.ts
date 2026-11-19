import { createHash } from 'node:crypto';
import plist from 'plist';
import { SigningError } from './errors.js';

/** The plist of a `.mobileprovision`, after its CMS signature has been verified elsewhere. */
export type MobileProvision = {
  uuid: string;
  teamId: string;
  appIdPattern: string;
  devices: string[];
  allDevices: boolean;
  /** SHA-1 hex (lower case) of every certificate the profile allows. */
  developerCertSha1: string[];
  expiresAt: Date;
};

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

export function readProfile(content: Buffer): MobileProvision {
  let body: Record<string, unknown>;
  try {
    const parsed = plist.parse(content.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    body = parsed as Record<string, unknown>;
  } catch {
    throw new SigningError('PROFILE_INVALID');
  }
  const team = body.TeamIdentifier;
  const entitlements = body.Entitlements as Record<string, unknown> | undefined;
  const appId = entitlements?.['application-identifier'];
  const certs = body.DeveloperCertificates;
  const devices = body.ProvisionedDevices ?? [];
  if (
    typeof body.UUID !== 'string' ||
    !isStringArray(team) ||
    typeof team[0] !== 'string' ||
    typeof appId !== 'string' ||
    !Array.isArray(certs) ||
    !certs.every((c) => Buffer.isBuffer(c)) ||
    !isStringArray(devices) ||
    !(body.ExpirationDate instanceof Date)
  ) {
    throw new SigningError('PROFILE_INVALID');
  }
  return {
    uuid: body.UUID,
    teamId: team[0],
    appIdPattern: appId,
    devices,
    allDevices: body.ProvisionsAllDevices === true,
    developerCertSha1: certs.map((c: Buffer) => createHash('sha1').update(c).digest('hex')),
    expiresAt: body.ExpirationDate,
  };
}
