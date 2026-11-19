// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Width, height and colour type from the PNG IHDR chunk (type 2 = RGB without alpha).
function pngHeader(path: string) {
  const file = readFileSync(at(path));
  expect(file.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20), colorType: file[25] };
}

describe('Xstore logo files', () => {
  it('the site mark is the blue X logo as a full-bleed square, the site rounds it', () => {
    // No alpha: the corners are filled, so CSS rounding never shows a gap or a black sliver.
    expect(pngHeader('../public/brand/mark.png')).toEqual({
      width: 256,
      height: 256,
      colorType: 2,
    });
    expect(existsSync(at('../public/brand/mark.svg'))).toBe(false);
  });

  it('the iPhone home screen icon is opaque, otherwise iOS paints the corners black', () => {
    expect(pngHeader('./apple-icon.png')).toEqual({ width: 180, height: 180, colorType: 2 });
  });

  it('the browser tab icon is the new logo with its own rounded corners', () => {
    expect(pngHeader('./icon.png')).toMatchObject({ width: 64, height: 64, colorType: 6 });
    expect(existsSync(at('./icon.svg'))).toBe(false);
  });
});
