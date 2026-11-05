import { open } from 'node:fs/promises';

export type EncryptionInfo = { encrypted: boolean; arches: string[] };

const FAT_MAGIC = 0xcafebabe;
const FAT_MAGIC_64 = 0xcafebabf;
const MH_MAGIC = 0xfeedface;
const MH_MAGIC_64 = 0xfeedfacf;
const LC_ENCRYPTION_INFO = 0x21;
const LC_ENCRYPTION_INFO_64 = 0x2c;

const MAX_FAT_ARCHES = 64;
const MAX_NCMDS = 100_000;
/** Load commands of real apps take kilobytes; anything near this is a broken file. */
const MAX_SIZEOFCMDS = 64 * 1024 ** 2;
const THIN_PROBE = 32;

type Slice = { offset: number; size: number };

type ThinHeader = {
  le: boolean;
  headerSize: number;
  cputype: number;
  cpusubtype: number;
  ncmds: number;
  sizeofcmds: number;
};

function archName(cputype: number, cpusubtype: number): string {
  const sub = cpusubtype & 0x00ffffff;
  switch (cputype) {
    case 0x0100000c:
      return sub === 2 ? 'arm64e' : 'arm64';
    case 0x0200000c:
      return 'arm64_32';
    case 12:
      return { 6: 'armv6', 9: 'armv7', 11: 'armv7s', 12: 'armv7k' }[sub] ?? 'arm';
    case 0x01000007:
      return 'x86_64';
    case 7:
      return 'i386';
    default:
      return `cpu-${(cputype >>> 0).toString(16)}`;
  }
}

function fail(message: string): never {
  throw new Error(`Mach-O: ${message}`);
}

/** Fat header → slice list, or `null` for a thin binary. */
function fatSlices(buf: Buffer): { slices: Slice[] } | { headerBytes: number } | null {
  if (buf.length < 8) fail('file too short');
  const magic = buf.readUInt32BE(0);
  if (magic !== FAT_MAGIC && magic !== FAT_MAGIC_64) return null;
  const n = buf.readUInt32BE(4);
  if (n === 0 || n > MAX_FAT_ARCHES) fail('bad fat arch count');
  const entry = magic === FAT_MAGIC ? 20 : 32;
  const headerBytes = 8 + n * entry;
  if (buf.length < headerBytes) return { headerBytes };
  const slices: Slice[] = [];
  for (let i = 0; i < n; i++) {
    const at = 8 + i * entry;
    if (magic === FAT_MAGIC) {
      slices.push({ offset: buf.readUInt32BE(at + 8), size: buf.readUInt32BE(at + 12) });
    } else {
      slices.push({
        offset: Number(buf.readBigUInt64BE(at + 8)),
        size: Number(buf.readBigUInt64BE(at + 16)),
      });
    }
  }
  return { slices };
}

function thinHeader(buf: Buffer): ThinHeader {
  if (buf.length < 28) fail('file too short');
  let le: boolean;
  let bits: 32 | 64;
  const asLe = buf.readUInt32LE(0);
  const asBe = buf.readUInt32BE(0);
  if (asLe === MH_MAGIC_64 || asLe === MH_MAGIC) {
    le = true;
    bits = asLe === MH_MAGIC_64 ? 64 : 32;
  } else if (asBe === MH_MAGIC_64 || asBe === MH_MAGIC) {
    le = false;
    bits = asBe === MH_MAGIC_64 ? 64 : 32;
  } else {
    fail('unknown magic');
  }
  const u32 = (at: number) => (le ? buf.readUInt32LE(at) : buf.readUInt32BE(at));
  const headerSize = bits === 64 ? 32 : 28;
  const ncmds = u32(16);
  const sizeofcmds = u32(20);
  if (ncmds > MAX_NCMDS || sizeofcmds > MAX_SIZEOFCMDS) fail('load commands too large');
  return { le, headerSize, cputype: u32(4), cpusubtype: u32(8), ncmds, sizeofcmds };
}

/** Walks the load commands of one thin slice that starts at `buf[0]`. */
function readThin(buf: Buffer): { encrypted: boolean; arch: string } {
  const h = thinHeader(buf);
  const end = h.headerSize + h.sizeofcmds;
  if (buf.length < end) fail('truncated load commands');
  const u32 = (at: number) => (h.le ? buf.readUInt32LE(at) : buf.readUInt32BE(at));
  let encrypted = false;
  let off = h.headerSize;
  for (let i = 0; i < h.ncmds; i++) {
    if (off + 8 > end) fail('load command past sizeofcmds');
    const cmd = u32(off);
    const cmdsize = u32(off + 4);
    if (cmdsize < 8 || off + cmdsize > end) fail('bad cmdsize');
    if (cmd === LC_ENCRYPTION_INFO || cmd === LC_ENCRYPTION_INFO_64) {
      if (cmdsize < 20) fail('short encryption command');
      // cryptid is the uint32 at command offset 16.
      if (u32(off + 16) !== 0) encrypted = true;
    }
    off += cmdsize;
  }
  return { encrypted, arch: archName(h.cputype, h.cpusubtype) };
}

function combine(parts: { encrypted: boolean; arch: string }[]): EncryptionInfo {
  return { encrypted: parts.some((p) => p.encrypted), arches: parts.map((p) => p.arch) };
}

/**
 * FairPlay status of a Mach-O executable held in memory: fat (`0xCAFEBABE`, big-endian) or thin
 * 32/64-bit. Encrypted when any slice has a non-zero `cryptid` in `LC_ENCRYPTION_INFO(_64)`.
 * Throws when the data is not a well-formed Mach-O.
 */
export function readEncryption(macho: Buffer): EncryptionInfo {
  const fat = fatSlices(macho);
  if (!fat) return combine([readThin(macho)]);
  if (!('slices' in fat)) fail('truncated fat header');
  return combine(
    fat.slices.map((s) => {
      if (s.offset + s.size > macho.length) fail('slice past end of file');
      return readThin(macho.subarray(s.offset, s.offset + s.size));
    }),
  );
}

/** Same as `readEncryption`, reading only the headers and load commands from disk. */
export async function readEncryptionFromFile(path: string): Promise<EncryptionInfo> {
  const fh = await open(path, 'r');
  try {
    const { size: fileSize } = await fh.stat();
    const readAt = async (position: number, length: number): Promise<Buffer> => {
      const len = Math.max(0, Math.min(length, fileSize - position));
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fh.read(buf, 0, len, position);
      return buf.subarray(0, bytesRead);
    };
    const slice = async (offset: number, size: number) => {
      if (offset + size > fileSize) fail('slice past end of file');
      const probe = await readAt(offset, Math.min(THIN_PROBE, size));
      const h = thinHeader(probe);
      return readThin(await readAt(offset, Math.min(size, h.headerSize + h.sizeofcmds)));
    };
    let fat = fatSlices(await readAt(0, 8));
    if (fat && !('slices' in fat)) fat = fatSlices(await readAt(0, fat.headerBytes));
    if (!fat) return combine([await slice(0, fileSize)]);
    if (!('slices' in fat)) fail('truncated fat header');
    const parts = [];
    for (const s of fat.slices) parts.push(await slice(s.offset, s.size));
    return combine(parts);
  } finally {
    await fh.close();
  }
}
