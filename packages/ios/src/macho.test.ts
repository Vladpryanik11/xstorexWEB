import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMachO } from '../test/helpers/build-macho.js';
import { readEncryption, readEncryptionFromFile } from './macho.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'xstore-macho-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readEncryption', () => {
  it('reads an unencrypted thin 64-bit binary', () => {
    expect(readEncryption(buildMachO({ cryptid: 0 }))).toEqual({
      encrypted: false,
      arches: ['arm64'],
    });
  });

  it('reads an encrypted thin 64-bit binary', () => {
    expect(readEncryption(buildMachO({ cryptid: 1 })).encrypted).toBe(true);
  });

  it('reads thin 32-bit binaries', () => {
    expect(readEncryption(buildMachO({ bits: 32, cryptid: 1 }))).toEqual({
      encrypted: true,
      arches: ['armv7'],
    });
  });

  it('treats a binary without an encryption command as unencrypted', () => {
    expect(readEncryption(buildMachO({})).encrypted).toBe(false);
  });

  it('flags FairPlay encryption in a fat binary', () => {
    expect(readEncryption(buildMachO({ fat: true, cryptid: 1 })).encrypted).toBe(true);
    expect(readEncryption(buildMachO({ fat: true, cryptid: 0 }))).toEqual({
      encrypted: false,
      arches: ['armv7', 'arm64'],
    });
  });

  it('throws on a file that is not Mach-O', () => {
    expect(() => readEncryption(Buffer.from('#!/bin/sh\necho hi\n'))).toThrow();
    expect(() => readEncryption(Buffer.alloc(2))).toThrow();
  });

  it('throws on truncated load commands', () => {
    const bin = buildMachO({ cryptid: 0 });
    bin.writeUInt32LE(10_000, 20); // sizeofcmds past the end
    expect(() => readEncryption(bin.subarray(0, 64))).toThrow();
  });
});

describe('readEncryptionFromFile', () => {
  it('reads only the headers it needs and agrees with readEncryption', async () => {
    for (const opts of [{ cryptid: 0 }, { cryptid: 1 }, { fat: true, cryptid: 1 }]) {
      const path = join(dir, 'bin');
      const bin = buildMachO(opts);
      await writeFile(path, bin);
      expect(await readEncryptionFromFile(path)).toEqual(readEncryption(bin));
    }
  });
});
