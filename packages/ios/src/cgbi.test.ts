import { crc32, deflateSync } from 'node:zlib';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { makePng, toCgbi } from '../test/helpers/to-cgbi.js';
import { cgbiToPng, isCgbi } from './cgbi.js';

function interlacedIcon(raw: Buffer): Buffer {
  const png = makePng(1, 1, [[1, 2, 3, 255]]);
  const head = Buffer.from(png.subarray(0, 33));
  head[28] = 1;
  head.writeUInt32BE(crc32(head.subarray(12, 29)), 29);
  const data = deflateSync(raw);
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write('IDAT', 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return Buffer.concat([head, chunk, png.subarray(-12)]);
}

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

  it('refuses oversized standard PNG dimensions before decoding', () => {
    const png = makePng(
      4097,
      1,
      Array.from({ length: 4097 }, () => [1, 2, 3, 255]),
    );
    expect(() => cgbiToPng(png)).toThrow(/size/);
  });

  it('rejects a second IHDR that could bypass the checked dimensions', () => {
    const first = makePng(1, 1, [[1, 2, 3, 255]]);
    const second = makePng(
      4097,
      1,
      Array.from({ length: 4097 }, () => [1, 2, 3, 255]),
    );
    const png = Buffer.concat([first.subarray(0, 33), second.subarray(8)]);
    expect(() => cgbiToPng(png)).toThrow(/IHDR/);
  });

  it('bounds inflation of interlaced PNGs even with a small IHDR', () => {
    expect(() => cgbiToPng(interlacedIcon(Buffer.alloc(512)))).toThrow();
  });

  it('preserves a valid interlaced standard PNG', () => {
    const decoded = PNG.sync.read(cgbiToPng(interlacedIcon(Buffer.from([0, 1, 2, 3, 255]))));
    expect([...decoded.data]).toEqual([1, 2, 3, 255]);
  });

  it('throws on data that is not a PNG', () => {
    expect(() => cgbiToPng(Buffer.from('nope'))).toThrow();
  });
});
