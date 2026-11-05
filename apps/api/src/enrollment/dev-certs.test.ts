import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { loadSigningIdentity } from './signing-identity.js';

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

it('creates a usable local profile signing identity without overwriting an existing key', async () => {
  dir = await mkdtemp(join(tmpdir(), 'xstore-dev-certs-'));
  const script = fileURLToPath(new URL('../../scripts/dev-certs.ts', import.meta.url));
  execFileSync(process.execPath, [script, dir]);
  const cert = join(dir, 'enroll.crt');
  const key = join(dir, 'enroll.key');
  const identity = await loadSigningIdentity(cert, key);
  expect(identity.privateKey.extractable).toBe(false);
  const original = await readFile(key);
  expect(() => execFileSync(process.execPath, [script, dir], { stdio: 'pipe' })).toThrow();
  expect(await readFile(key)).toEqual(original);
});
