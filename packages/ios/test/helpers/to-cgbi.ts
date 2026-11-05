import { crc32, deflateRawSync } from 'node:zlib';
import { PNG } from 'pngjs';

/** A standard RGBA PNG of `width × height` from `[r, g, b, a]` pixels in row order. */
export function makePng(width: number, height: number, pixels: number[][]): Buffer {
  const png = new PNG({ width, height });
  pixels.forEach((p, i) => {
    png.data.set(p, i * 4);
  });
  return PNG.sync.write(png);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Converts a standard PNG into Apple's CgBI variant the way Xcode does: premultiplied BGRA,
 * raw deflate without the zlib header, and a `CgBI` chunk before `IHDR`. Rows cycle through all
 * five filter types so the decoder's unfiltering is exercised.
 */
export function toCgbi(png: Buffer): Buffer {
  const { width, height, data } = PNG.sync.read(png);
  const stride = width * 4;
  const raw = Buffer.alloc(height * stride);
  for (let i = 0; i < width * height; i++) {
    const [r, g, b, a] = [
      data[i * 4] ?? 0,
      data[i * 4 + 1] ?? 0,
      data[i * 4 + 2] ?? 0,
      data[i * 4 + 3] ?? 0,
    ];
    const pm = (c: number) => Math.round((c * a) / 255);
    raw.set([pm(b), pm(g), pm(r), a], i * 4);
  }
  const filtered = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const type = y % 5;
    filtered[y * (stride + 1)] = type;
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * stride + x] ?? 0;
      const left = x >= 4 ? (raw[y * stride + x - 4] ?? 0) : 0;
      const up = y > 0 ? (raw[(y - 1) * stride + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= 4 ? (raw[(y - 1) * stride + x - 4] ?? 0) : 0;
      const pred = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][type] ?? 0;
      filtered[y * (stride + 1) + 1 + x] = (cur - pred) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('CgBI', Buffer.from([0x50, 0x00, 0x20, 0x06])),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateRawSync(filtered)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
