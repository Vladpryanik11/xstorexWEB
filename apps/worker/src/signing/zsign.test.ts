import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiskFullError, ensureFreeSpace } from './disk.js';
import { writeIdentityFiles } from './identity-files.js';
import { withTempDir } from './temp.js';
import { runZsign, ZsignError } from './zsign.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'zsign-test-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function script(name: string, body: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

/** Records its argv, one per line, and copies the input (last argument) to `-o`. */
const RECORDER = `
printf '%s\\n' "$@" > "$(dirname "$0")/args.txt"
out=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; last="$a"; done
cp "$last" "$out"
`;

const opts = (zsignBin: string) => ({
  zsignBin,
  input: join(dir, 'in.ipa'),
  output: join(dir, 'out.ipa'),
  keyPath: join(dir, 'key.pem'),
  certPath: join(dir, 'cert.pem'),
  profilePath: join(dir, 'embedded.mobileprovision'),
  timeoutMs: 5000,
  memoryMb: 512,
  cpuSec: 30,
});

describe('runZsign', () => {
  beforeEach(async () => {
    await writeFile(join(dir, 'in.ipa'), 'ipa');
  });

  it('passes PEM files and never a password', async () => {
    const bin = await script('zsign', RECORDER);
    await runZsign(opts(bin));
    const args = (await readFile(join(dir, 'args.txt'), 'utf8')).trim().split('\n');
    const o = opts(bin);
    expect(args).toEqual(
      expect.arrayContaining([
        '-k',
        o.keyPath,
        '-c',
        o.certPath,
        '-m',
        o.profilePath,
        '-o',
        o.output,
      ]),
    );
    expect(args).not.toContain('-p');
    expect(args.at(-1)).toBe(o.input);
    expect(await readFile(o.output, 'utf8')).toBe('ipa');
  });

  it('passes bundle id only when given', async () => {
    const bin = await script('zsign', RECORDER);
    await runZsign(opts(bin));
    expect(await readFile(join(dir, 'args.txt'), 'utf8')).not.toContain('-b');
    await runZsign({ ...opts(bin), bundleId: 'ru.supplier.one' });
    const args = (await readFile(join(dir, 'args.txt'), 'utf8')).trim().split('\n');
    expect(args).toEqual(expect.arrayContaining(['-b', 'ru.supplier.one']));
  });

  it('fails with the tail of stderr on a non-zero exit', async () => {
    const bin = await script('zsign', 'echo "bad profile" >&2; exit 3');
    const err = await runZsign(opts(bin)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ZsignError);
    expect((err as ZsignError).exitCode).toBe(3);
    expect((err as ZsignError).stderrTail).toContain('bad profile');
  });

  it('kills on timeout', async () => {
    const bin = await script('zsign', 'sleep 30');
    const started = Date.now();
    await expect(runZsign({ ...opts(bin), timeoutMs: 300 })).rejects.toThrow(ZsignError);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('fails when zsign produced no output', async () => {
    const bin = await script('zsign', 'exit 0');
    await expect(runZsign(opts(bin))).rejects.toThrow(ZsignError);
  });
});

describe('writeIdentityFiles', () => {
  it('writes key, certificate and profile readable by the owner only', async () => {
    const files = await writeIdentityFiles(dir, {
      privateKeyPem: 'KEY',
      certificatePem: 'CERT',
      profile: Buffer.from('PROFILE'),
    });
    for (const path of [files.keyPath, files.certPath, files.profilePath]) {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
    expect(await readFile(files.keyPath, 'utf8')).toBe('KEY');
    expect(await readFile(files.profilePath, 'utf8')).toBe('PROFILE');
  });
});

describe('withTempDir', () => {
  it('cleans up after success and after failure', async () => {
    let seen = '';
    await withTempDir(dir, async (d) => {
      seen = d;
      await writeFile(join(d, 'x'), 'x');
    });
    await expect(stat(seen)).rejects.toThrow();
    await expect(
      withTempDir(dir, async (d) => {
        seen = d;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(stat(seen)).rejects.toThrow();
  });
});

describe('ensureFreeSpace', () => {
  it('passes with room and reports low disk space', async () => {
    await expect(ensureFreeSpace(dir, 1)).resolves.toBeUndefined();
    await expect(ensureFreeSpace(dir, Number.MAX_SAFE_INTEGER)).rejects.toThrow(DiskFullError);
  });
});
