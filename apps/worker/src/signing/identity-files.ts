import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type IdentityFiles = { keyPath: string; certPath: string; profilePath: string };

/** Writes the signing identity for zsign; every file is readable by the owner only. */
export async function writeIdentityFiles(
  dir: string,
  kit: { privateKeyPem: string; certificatePem: string; profile: Buffer },
): Promise<IdentityFiles> {
  const files = {
    keyPath: join(dir, 'key.pem'),
    certPath: join(dir, 'cert.pem'),
    profilePath: join(dir, 'embedded.mobileprovision'),
  };
  await writeFile(files.keyPath, kit.privateKeyPem, { mode: 0o600 });
  await writeFile(files.certPath, kit.certificatePem, { mode: 0o600 });
  await writeFile(files.profilePath, kit.profile, { mode: 0o600 });
  return files;
}
