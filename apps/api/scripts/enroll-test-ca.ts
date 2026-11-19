/**
 * Development and CI only: a stand-in for Apple's device PKI, so e2e tests can post iOS-like
 * answers. Writes to `.secrets/enroll/` at the repository root (gitignored):
 *   test-anchor.pem      the test root, for ENROLL_TEST_ANCHOR_PATH (refused in production)
 *   test-device.pem      device certificate followed by its two intermediates
 *   test-device-key.pem  the device key that signs the answers
 *
 *   pnpm --filter @xstore/api enroll:test-ca [--force]
 */
import { existsSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createTestCa } from '../test/support/test-ca.ts';

const dir = fileURLToPath(new URL('../../../.secrets/enroll/', import.meta.url));
const anchorPath = `${dir}test-anchor.pem`;
const devicePath = `${dir}test-device.pem`;
const deviceKeyPath = `${dir}test-device-key.pem`;

if (
  [anchorPath, devicePath, deviceKeyPath].every((p) => existsSync(p)) &&
  !process.argv.includes('--force')
) {
  console.log(`Already exists: ${anchorPath} (use --force to replace)`);
} else {
  const ca = await createTestCa();
  const { certificate, chain, privateKey } = ca.device;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(anchorPath, ca.rootPem);
  await writeFile(devicePath, [certificate, ...chain].map((c) => c.toString()).join(''));
  await writeFile(deviceKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
    mode: 0o600,
  });
  await chmod(deviceKeyPath, 0o600);
  console.log(`Wrote ${anchorPath}, ${devicePath} and ${deviceKeyPath}`);
}
console.log(`Set in .env (never in production):\nENROLL_TEST_ANCHOR_PATH=${anchorPath}`);
