import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { errorMessages } from '@xstore/shared';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildIpa,
  buildIpaBuffer,
  defaultInfo,
  renameEntry,
  writeTemp,
} from '../test/helpers/build-ipa.js';
import { buildMachO } from '../test/helpers/build-macho.js';
import { makePng, toCgbi } from '../test/helpers/to-cgbi.js';
import { IPA_REJECT_CODES, inspectIpa } from './index.js';

let tmp: string;
let files: string;
beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'xstore-inspect-'));
  files = await mkdtemp(join(tmpdir(), 'xstore-inspect-files-'));
});
afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
  await rm(files, { recursive: true, force: true });
});

function solid(size: number): Buffer {
  return makePng(
    size,
    size,
    Array.from({ length: size * size }, () => [10, 20, 30, 255]),
  );
}

describe('inspectIpa', () => {
  it('reads Info.plist from a minimal IPA', async () => {
    const ipa = await buildIpa({ info: defaultInfo, binary: buildMachO({ cryptid: 0 }) }, files);
    const r = await inspectIpa(ipa, tmp);
    expect(r).toMatchObject({
      ok: true,
      encrypted: false,
      info: {
        name: 'Тест',
        bundleId: 'ru.test.app',
        version: '1.2',
        build: '45',
        minIos: '15.0',
        deviceFamily: [1, 2],
        executable: 'Test',
      },
      iconPng: null,
    });
  });

  it('reports size and sha256 of the whole file', async () => {
    const ipa = await buildIpa({}, files);
    const bytes = await readFile(ipa);
    const r = await inspectIpa(ipa, tmp);
    expect(r).toMatchObject({
      ok: true,
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  });

  it('reads binary plists', async () => {
    const ipa = await buildIpa({ binaryPlist: true }, files);
    expect(await inspectIpa(ipa, tmp)).toMatchObject({
      ok: true,
      info: { name: 'Тест', bundleId: 'ru.test.app', version: '1.2', build: '45' },
    });
  });

  it('flags an encrypted binary', async () => {
    const ipa = await buildIpa({ binary: buildMachO({ fat: true, cryptid: 1 }) }, files);
    expect(await inspectIpa(ipa, tmp)).toMatchObject({ ok: true, encrypted: true });
  });

  it('extracts the largest icon and converts it from CgBI', async () => {
    const info = {
      ...defaultInfo,
      CFBundleIcons: { CFBundlePrimaryIcon: { CFBundleIconFiles: ['AppIcon60x60'] } },
    };
    const ipa = await buildIpa(
      {
        info,
        files: {
          'Payload/Test.app/AppIcon60x60@2x.png': toCgbi(solid(120)),
          'Payload/Test.app/AppIcon60x60@3x.png': toCgbi(solid(180)),
          'Payload/Test.app/Other.png': solid(512),
        },
      },
      files,
    );
    const r = await inspectIpa(ipa, tmp);
    if (!r.ok || !r.iconPng) throw new Error('expected an icon');
    const png = PNG.sync.read(r.iconPng);
    expect(png.width).toBe(180);
    expect([...png.data.subarray(0, 4)]).toEqual([10, 20, 30, 255]);
  });

  it('falls back to AppIcon files when Info.plist names no icons', async () => {
    const ipa = await buildIpa(
      { files: { 'Payload/Test.app/AppIcon76x76@2x~ipad.png': solid(152) } },
      files,
    );
    const r = await inspectIpa(ipa, tmp);
    expect(r.ok && r.iconPng && PNG.sync.read(r.iconPng).width).toBe(152);
  });

  it('keeps going without an icon when the icon is broken', async () => {
    const info = { ...defaultInfo, CFBundleIconFiles: ['Icon.png'] };
    const ipa = await buildIpa(
      { info, files: { 'Payload/Test.app/Icon.png': randomBytes(64) } },
      files,
    );
    expect(await inspectIpa(ipa, tmp)).toMatchObject({ ok: true, iconPng: null });
  });

  it('reports a non-zip file', async () => {
    const path = await writeTemp(randomBytes(4096), files);
    expect(await inspectIpa(path, tmp)).toEqual({ ok: false, reason: 'IPA_NOT_ZIP' });
  });

  it('rejects traversal in a real archive', async () => {
    const placeholder = 'Payload/Test.app/XXXXXXXXXXXXXXXX';
    const evil = '../../../../../../tmp/evil.txt';
    const zip = await buildIpaBuffer({ files: { [placeholder]: Buffer.from('x') } });
    const path = await writeTemp(
      renameEntry(zip, placeholder, evil.padEnd(placeholder.length, '_')),
      files,
    );
    expect(await inspectIpa(path, tmp)).toEqual({ ok: false, reason: 'IPA_UNSAFE_PATH' });
  });

  it('rejects bombs in a real archive', async () => {
    const ipa = await buildIpa(
      { files: { 'Payload/Test.app/zeros': Buffer.alloc(8 * 1024 ** 2) } },
      files,
    );
    expect(await inspectIpa(ipa, tmp)).toEqual({ ok: false, reason: 'IPA_ZIP_BOMB' });
  });

  it('rejects ambiguous payload in a real archive', async () => {
    const two = await buildIpa(
      { files: { 'Payload/Other.app/Info.plist': Buffer.from('x') } },
      files,
    );
    expect(await inspectIpa(two, tmp)).toEqual({ ok: false, reason: 'IPA_MANY_APPS' });
  });

  it('rejects a broken Info.plist', async () => {
    const ipa = await buildIpa({ infoRaw: Buffer.from('<plist><dict><key>') }, files);
    expect(await inspectIpa(ipa, tmp)).toEqual({ ok: false, reason: 'IPA_BAD_PLIST' });
    const { CFBundleIdentifier: _, ...noId } = defaultInfo;
    const ipa2 = await buildIpa({ info: noId }, files);
    expect(await inspectIpa(ipa2, tmp)).toEqual({ ok: false, reason: 'IPA_BAD_PLIST' });
  });

  it('rejects a missing or non-Mach-O executable', async () => {
    const none = await buildIpa({ binary: null }, files);
    expect(await inspectIpa(none, tmp)).toEqual({ ok: false, reason: 'IPA_NO_BINARY' });
    const script = await buildIpa({ binary: Buffer.from('#!/bin/sh\n') }, files);
    expect(await inspectIpa(script, tmp)).toEqual({ ok: false, reason: 'IPA_NO_BINARY' });
  });

  it('leaves nothing behind in the temp dir', async () => {
    await inspectIpa(await buildIpa({ binary: buildMachO({ fat: true, cryptid: 1 }) }, files), tmp);
    await inspectIpa(await buildIpa({ binary: null }, files), tmp);
    expect(await readdir(tmp)).toEqual([]);
  });
});

describe('reject codes', () => {
  it('every code has a Russian message', () => {
    for (const code of IPA_REJECT_CODES) expect(errorMessages[code]).toMatch(/[а-яё]/i);
  });
});
