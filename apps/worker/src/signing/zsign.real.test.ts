import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectIpa } from '@xstore/ios';
import { parseP12 } from '@xstore/signing';
import { makeKit } from '@xstore/signing/testing';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { buildIpaBuffer } from '../../../../packages/ios/test/helpers/build-ipa.js';
import { buildExecutable } from '../../test/helpers/build-executable.js';
import { writeIdentityFiles } from './identity-files.js';
import { runZsign } from './zsign.js';

/** Real zsign (the worker image's `test` stage sets ZSIGN_BIN); skipped without it. */
const ZSIGN = process.env.ZSIGN_BIN;
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'zsign-real-'));
});
afterEach(async () => rm(dir, { recursive: true, force: true }));

async function sign(bundleId?: string) {
  const kit = makeKit();
  const p12 = await parseP12(kit.p12, kit.password);
  const files = await writeIdentityFiles(dir, { parsed: p12, profile: kit.profile });
  const input = join(dir, 'in.ipa');
  await writeFile(input, await buildIpaBuffer({ binary: buildExecutable() }));
  const output = join(dir, 'out.ipa');
  await runZsign({
    zsignBin: ZSIGN ?? '',
    input,
    output,
    ...files,
    workDir: dir,
    ...(bundleId ? { bundleId } : {}),
    timeoutMs: 60_000,
    memoryMb: 1024,
    cpuSec: 60,
  });
  return { output, kit };
}

it.skipIf(!ZSIGN)('signs a synthetic app', async () => {
  const { output } = await sign();
  const zip = await readFile(output);
  expect(zip.includes('Payload/Test.app/_CodeSignature/CodeResources')).toBe(true);
  expect(zip.includes('Payload/Test.app/embedded.mobileprovision')).toBe(true);
  const info = await inspectIpa(output, dir);
  expect(info.ok && info.info.bundleId).toBe('ru.test.app');
});

it.skipIf(!ZSIGN)('changes the bundle id for a single-app profile', async () => {
  const { output } = await sign('ru.supplier.one');
  const info = await inspectIpa(output, dir);
  expect(info.ok && info.info.bundleId).toBe('ru.supplier.one');
});
