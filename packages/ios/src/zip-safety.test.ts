import { describe, expect, it } from 'vitest';
import { checkZipSafety, type ZipEntryMeta } from './zip-safety.js';

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

function meta(name: string, compressedSize = 100, uncompressedSize = 200): ZipEntryMeta {
  return { name, compressedSize, uncompressedSize };
}

const app = [meta('Payload/'), meta('Payload/A.app/'), meta('Payload/A.app/Info.plist')];

describe('checkZipSafety', () => {
  it('accepts a well-formed payload and returns the app directory', () => {
    expect(checkZipSafety([...app, meta('Payload/A.app/A')])).toEqual({
      ok: true,
      appDir: 'Payload/A.app/',
    });
  });

  it('accepts nested bundles such as a watch app', () => {
    const nested = [meta('Payload/A.app/Watch/W.app/Info.plist')];
    expect(checkZipSafety([...app, ...nested])).toMatchObject({
      ok: true,
      appDir: 'Payload/A.app/',
    });
  });

  it('rejects traversal', () => {
    expect(checkZipSafety([meta('Payload/../../etc/x')])).toEqual({
      ok: false,
      reason: 'IPA_UNSAFE_PATH',
    });
    expect(checkZipSafety([...app, meta('Payload/A.app/..')])).toMatchObject({
      reason: 'IPA_UNSAFE_PATH',
    });
  });

  it('rejects absolute paths, backslashes and NUL bytes', () => {
    for (const name of ['/etc/passwd', 'C:/x', 'Payload\\A.app\\x', 'Payload/A.app/a\0b']) {
      expect(checkZipSafety([...app, meta(name)])).toMatchObject({ reason: 'IPA_UNSAFE_PATH' });
    }
  });

  it('rejects bombs', () => {
    const r = checkZipSafety([
      meta('Payload/A.app/Info.plist'),
      meta('Payload/A.app/big', 1024, 2 * GiB),
    ]);
    expect(r).toEqual({ ok: false, reason: 'IPA_ZIP_BOMB' });
  });

  it('allows a high ratio on small entries', () => {
    expect(checkZipSafety([...app, meta('Payload/A.app/zeros', 10, MiB)]).ok).toBe(true);
  });

  it('flags a large entry stored with zero compressed bytes', () => {
    expect(checkZipSafety([...app, meta('Payload/A.app/x', 0, 2 * MiB)])).toMatchObject({
      reason: 'IPA_ZIP_BOMB',
    });
  });

  it('caps the total uncompressed size at 32 GiB', () => {
    const parts = Array.from({ length: 17 }, (_, i) => meta(`Payload/A.app/p${i}`, GiB, 2 * GiB));
    expect(checkZipSafety([...app, ...parts])).toMatchObject({ reason: 'IPA_ZIP_BOMB' });
  });

  it('caps the number of entries at 200 000', () => {
    const many = Array.from({ length: 200_000 }, (_, i) => meta(`Payload/A.app/f${i}`));
    expect(checkZipSafety([...app, ...many])).toMatchObject({ reason: 'IPA_ZIP_BOMB' });
  });

  it('rejects ambiguous payload', () => {
    const two = [...app, meta('Payload/B.app/Info.plist')];
    expect(checkZipSafety(two)).toEqual({ ok: false, reason: 'IPA_MANY_APPS' });
    const second = [...app, meta('Payload/B.app/B')];
    expect(checkZipSafety(second)).toMatchObject({ reason: 'IPA_MANY_APPS' });
    expect(checkZipSafety([meta('Payload/'), meta('Payload/readme.txt')])).toEqual({
      ok: false,
      reason: 'IPA_NO_APP',
    });
    expect(checkZipSafety([meta('Payload/A.app/A')])).toMatchObject({ reason: 'IPA_NO_APP' });
    expect(checkZipSafety([meta('A.app/Info.plist')])).toMatchObject({ reason: 'IPA_NO_APP' });
  });
});
