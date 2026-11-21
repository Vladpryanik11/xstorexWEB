import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ParsedP12, packP12 } from '@xstore/signing';

export type IdentityFiles = { p12Path: string; p12Password: string; profilePath: string };

/**
 * Writes the signing identity for zsign, readable by the owner only: the supplier's key and
 * chain packed again under a random one-time password (zsign takes the WWDR chain only from a
 * `.p12`), and the profile. The supplier's password never leaves this process.
 */
export async function writeIdentityFiles(
  dir: string,
  kit: { parsed: ParsedP12; profile: Buffer },
): Promise<IdentityFiles> {
  const p12Password = randomBytes(24).toString('base64url');
  const files = {
    p12Path: join(dir, 'identity.p12'),
    p12Password,
    profilePath: join(dir, 'embedded.mobileprovision'),
  };
  await writeFile(files.p12Path, packP12(kit.parsed, p12Password), { mode: 0o600 });
  await writeFile(files.profilePath, kit.profile, { mode: 0o600 });
  return files;
}
