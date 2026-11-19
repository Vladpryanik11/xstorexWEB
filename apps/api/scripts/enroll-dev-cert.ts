/**
 * Development and CI only: a self-signed certificate that signs the connection profile.
 * Writes `.secrets/enroll/cert.pem` and `key.pem` at the repository root (gitignored).
 * Production signs with Caddy's certificate for SITE_DOMAIN instead.
 *
 *   pnpm --filter @xstore/api enroll:dev-cert [--force]
 */
import { generateKeyPairSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { issueCertificate } from '../src/enrollment/x509.ts';

const DAY = 24 * 60 * 60 * 1000;
const dir = fileURLToPath(new URL('../../../.secrets/enroll/', import.meta.url));
const certPath = `${dir}cert.pem`;
const keyPath = `${dir}key.pem`;

if (existsSync(certPath) && existsSync(keyPath) && !process.argv.includes('--force')) {
  console.log(`Already exists: ${certPath} (use --force to replace)`);
} else {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const cert = await issueCertificate({
    subject: 'Xstore development profile signer',
    keys,
    ca: false,
    notBefore: new Date(Date.now() - DAY),
    notAfter: new Date(Date.now() + 365 * DAY),
    dnsNames: ['localhost'],
  });
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(certPath, cert.toString());
  await writeFile(keyPath, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), {
    mode: 0o600,
  });
  await chmod(keyPath, 0o600);
  console.log(`Wrote ${certPath} and ${keyPath}`);
}
console.log(`Set in .env:\nENROLL_CERT_PATH=${certPath}\nENROLL_KEY_PATH=${keyPath}`);
