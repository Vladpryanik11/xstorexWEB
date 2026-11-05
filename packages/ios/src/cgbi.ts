import { inflateRawSync, inflateSync } from 'node:zlib';
import { PNG } from 'pngjs';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** App icons are at most 1024 px; anything far larger is refused before inflating. */
const MAX_SIDE = 4096;
const BPP = 4;

type Chunk = { type: string; data: Buffer };

function chunks(buf: Buffer): Chunk[] {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  const out: Chunk[] = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const start = off + 8;
    if (start + len + 4 > buf.length) throw new Error('truncated PNG chunk');
    out.push({ type, data: buf.subarray(start, start + len) });
    off = start + len + 4;
    if (type === 'IEND') break;
  }
  return out;
}

export function isCgbi(buf: Buffer): boolean {
  return chunks(buf).some((c) => c.type === 'CgBI');
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function unfilter(filtered: Buffer, width: number, height: number): Buffer {
  const stride = width * BPP;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const type = filtered[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const raw = filtered[src + x] ?? 0;
      const left = x >= BPP ? (out[row + x - BPP] ?? 0) : 0;
      const up = y > 0 ? (out[row - stride + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= BPP ? (out[row - stride + x - BPP] ?? 0) : 0;
      let pred: number;
      switch (type) {
        case 0:
          pred = 0;
          break;
        case 1:
          pred = left;
          break;
        case 2:
          pred = up;
          break;
        case 3:
          pred = (left + up) >> 1;
          break;
        case 4:
          pred = paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`bad PNG filter ${type}`);
      }
      out[row + x] = (raw + pred) & 0xff;
    }
  }
  return out;
}

/**
 * Converts Apple's CgBI PNG (premultiplied BGRA, raw deflate) into a standard RGBA PNG.
 * Returns the input itself when it has no `CgBI` chunk. Throws on malformed data.
 */
export function cgbiToPng(buf: Buffer): Buffer {
  const list = chunks(buf);
  if (!list.some((c) => c.type === 'CgBI')) return buf;
  const ihdr = list.find((c) => c.type === 'IHDR')?.data;
  if (!ihdr || ihdr.length < 13) throw new Error('CgBI: no IHDR');
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const [bitDepth, colorType, , , interlace] = ihdr.subarray(8, 13);
  if (width === 0 || height === 0 || width > MAX_SIDE || height > MAX_SIDE)
    throw new Error('CgBI: bad size');
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0)
    throw new Error('CgBI: only 8-bit non-interlaced RGBA is supported');
  const idat = Buffer.concat(list.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const expected = height * (width * BPP + 1);
  let filtered: Buffer;
  try {
    filtered = inflateRawSync(idat, { maxOutputLength: expected });
  } catch {
    // A few tools write CgBI with a zlib header.
    filtered = inflateSync(idat, { maxOutputLength: expected });
  }
  if (filtered.length !== expected) throw new Error('CgBI: wrong image data length');
  const pixels = unfilter(filtered, width, height);
  const png = new PNG({ width, height });
  for (let i = 0; i < pixels.length; i += BPP) {
    const b = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const r = pixels[i + 2] ?? 0;
    const a = pixels[i + 3] ?? 0;
    const un = (c: number) => (a ? Math.min(255, Math.round((c * 255) / a)) : 0);
    png.data[i] = un(r);
    png.data[i + 1] = un(g);
    png.data[i + 2] = un(b);
    png.data[i + 3] = a;
  }
  return PNG.sync.write(png);
}
