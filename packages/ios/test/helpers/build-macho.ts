/** Builds tiny synthetic Mach-O executables for tests (header + load commands only). */

const MH_MAGIC = 0xfeedface;
const MH_MAGIC_64 = 0xfeedfacf;
const FAT_MAGIC = 0xcafebabe;
const CPU_TYPE_ARM = 12;
const CPU_TYPE_ARM64 = 0x0100000c;
const LC_SEGMENT_64 = 0x19;
const LC_ENCRYPTION_INFO = 0x21;
const LC_ENCRYPTION_INFO_64 = 0x2c;

export type ThinOptions = {
  bits?: 32 | 64;
  /** `undefined` leaves the encryption load command out. */
  cryptid?: number;
};

export function buildThinMachO({ bits = 64, cryptid }: ThinOptions = {}): Buffer {
  const headerSize = bits === 64 ? 32 : 28;
  const filler = Buffer.alloc(72);
  filler.writeUInt32LE(LC_SEGMENT_64, 0);
  filler.writeUInt32LE(72, 4);
  const commands = [filler];
  if (cryptid !== undefined) {
    const size = bits === 64 ? 24 : 20;
    const enc = Buffer.alloc(size);
    enc.writeUInt32LE(bits === 64 ? LC_ENCRYPTION_INFO_64 : LC_ENCRYPTION_INFO, 0);
    enc.writeUInt32LE(size, 4);
    enc.writeUInt32LE(0x4000, 8);
    enc.writeUInt32LE(0x10000, 12);
    enc.writeUInt32LE(cryptid, 16);
    commands.push(enc);
  }
  const cmds = Buffer.concat(commands);
  const header = Buffer.alloc(headerSize);
  header.writeUInt32LE(bits === 64 ? MH_MAGIC_64 : MH_MAGIC, 0);
  header.writeUInt32LE(bits === 64 ? CPU_TYPE_ARM64 : CPU_TYPE_ARM, 4);
  header.writeUInt32LE(bits === 64 ? 0 : 9, 8);
  header.writeUInt32LE(2, 12);
  header.writeUInt32LE(commands.length, 16);
  header.writeUInt32LE(cmds.length, 20);
  // Some code after the load commands, as in a real binary.
  return Buffer.concat([header, cmds, Buffer.alloc(256, 0xaa)]);
}

export type MachOOptions = ThinOptions & { fat?: boolean };

/**
 * Thin binary by default; `fat: true` wraps an unencrypted armv7 slice and an arm64 slice with
 * the given `cryptid` in a fat header.
 */
export function buildMachO({ fat = false, ...thin }: MachOOptions = {}): Buffer {
  if (!fat) return buildThinMachO(thin);
  const slices = [buildThinMachO({ bits: 32, cryptid: 0 }), buildThinMachO({ ...thin, bits: 64 })];
  const align = 12;
  const header = Buffer.alloc(8 + 20 * slices.length);
  header.writeUInt32BE(FAT_MAGIC, 0);
  header.writeUInt32BE(slices.length, 4);
  const parts: Buffer[] = [header];
  let offset = 1 << align;
  parts.push(Buffer.alloc(offset - header.length));
  slices.forEach((slice, i) => {
    const at = 8 + 20 * i;
    header.writeUInt32BE(i === 0 ? CPU_TYPE_ARM : CPU_TYPE_ARM64, at);
    header.writeUInt32BE(i === 0 ? 9 : 0, at + 4);
    header.writeUInt32BE(offset, at + 8);
    header.writeUInt32BE(slice.length, at + 12);
    header.writeUInt32BE(align, at + 16);
    const padded = Buffer.alloc(Math.ceil(slice.length / (1 << align)) * (1 << align));
    slice.copy(padded);
    parts.push(padded);
    offset += padded.length;
  });
  return Buffer.concat(parts);
}
