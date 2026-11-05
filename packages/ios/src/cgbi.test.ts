import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { makePng, toCgbi } from '../test/helpers/to-cgbi.js';
import { cgbiToPng, isCgbi } from './cgbi.js';

describe('cgbiToPng', () => {
  it('converts CgBI to a standard PNG', () => {
    const png = makePng(2, 1, [
      [255, 0, 0, 128],
      [0, 0, 255, 255],
    ]);
    const out = PNG.sync.read(cgbiToPng(toCgbi(png)));
    expect([...out.data.subarray(0, 8)]).toEqual([255, 0, 0, 128, 0, 0, 255, 255]);
  });

  it('undoes every row filter', () => {
    const w = 3;
    const h = 5;
    const pixels = Array.from({ length: w * h }, (_, i) => [
      (i * 37) % 256,
      (i * 91) % 256,
      (i * 13) % 256,
      255,
    ]);
    const out = PNG.sync.read(cgbiToPng(toCgbi(makePng(w, h, pixels))));
    expect(out.width).toBe(w);
    expect(out.height).toBe(h);
    expect([...out.data]).toEqual(pixels.flat());
  });

  it('turns fully transparent pixels into transparent black', () => {
    const out = PNG.sync.read(cgbiToPng(toCgbi(makePng(1, 1, [[200, 100, 50, 0]]))));
    expect([...out.data]).toEqual([0, 0, 0, 0]);
  });

  it('returns a standard PNG unchanged', () => {
    const png = makePng(1, 1, [[1, 2, 3, 4]]);
    expect(isCgbi(png)).toBe(false);
    expect(cgbiToPng(png)).toBe(png);
  });

  it('throws on data that is not a PNG', () => {
    expect(() => cgbiToPng(Buffer.from('nope'))).toThrow();
  });
});
