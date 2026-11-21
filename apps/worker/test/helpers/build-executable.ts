/**
 * A tiny but well-formed arm64 iOS executable for real zsign runs: `__PAGEZERO`, `__TEXT` with one
 * `ret`, `__LINKEDIT` last, `LC_MAIN`, `LC_LOAD_DYLINKER`, and free header space where zsign adds
 * its `LC_CODE_SIGNATURE`. It never runs anywhere; zsign only needs the layout.
 */
const PAGE = 0x4000;
const BASE = 0x1_0000_0000n;

function segment(
  name: string,
  vmaddr: bigint,
  vmsize: bigint,
  fileoff: number,
  filesize: number,
  prot: number,
  sections: Buffer[] = [],
): Buffer {
  const b = Buffer.alloc(72);
  b.writeUInt32LE(0x19, 0);
  b.writeUInt32LE(72 + 80 * sections.length, 4);
  b.write(name, 8, 'latin1');
  b.writeBigUInt64LE(vmaddr, 24);
  b.writeBigUInt64LE(vmsize, 32);
  b.writeBigUInt64LE(BigInt(fileoff), 40);
  b.writeBigUInt64LE(BigInt(filesize), 48);
  b.writeUInt32LE(prot, 56);
  b.writeUInt32LE(prot, 60);
  b.writeUInt32LE(sections.length, 64);
  return Buffer.concat([b, ...sections]);
}

function textSection(addr: bigint, offset: number, size: number): Buffer {
  const s = Buffer.alloc(80);
  s.write('__text', 0, 'latin1');
  s.write('__TEXT', 16, 'latin1');
  s.writeBigUInt64LE(addr, 32);
  s.writeBigUInt64LE(BigInt(size), 40);
  s.writeUInt32LE(offset, 48);
  s.writeUInt32LE(2, 52);
  s.writeUInt32LE(0x80000400, 64);
  return s;
}

export function buildExecutable(): Buffer {
  const codeOff = PAGE - 4;
  const linkeditSize = 0x20;
  const mainCmd = Buffer.alloc(24);
  mainCmd.writeUInt32LE(0x80000028, 0);
  mainCmd.writeUInt32LE(24, 4);
  mainCmd.writeBigUInt64LE(BigInt(codeOff), 8);
  const dyld = Buffer.alloc(32);
  dyld.writeUInt32LE(0xe, 0);
  dyld.writeUInt32LE(32, 4);
  dyld.writeUInt32LE(12, 8);
  dyld.write('/usr/lib/dyld', 12, 'latin1');
  const cmds = [
    segment('__PAGEZERO', 0n, BASE, 0, 0, 0),
    segment('__TEXT', BASE, BigInt(PAGE), 0, PAGE, 5, [
      textSection(BASE + BigInt(codeOff), codeOff, 4),
    ]),
    segment('__LINKEDIT', BASE + BigInt(PAGE), BigInt(PAGE), PAGE, linkeditSize, 1),
    mainCmd,
    dyld,
  ];
  const body = Buffer.concat(cmds);
  const header = Buffer.alloc(32);
  header.writeUInt32LE(0xfeedfacf, 0);
  header.writeUInt32LE(0x0100000c, 4);
  header.writeUInt32LE(0, 8);
  header.writeUInt32LE(2, 12);
  header.writeUInt32LE(cmds.length, 16);
  header.writeUInt32LE(body.length, 20);
  header.writeUInt32LE(0x1 | 0x4 | 0x80 | 0x200000, 24);
  const file = Buffer.alloc(PAGE + linkeditSize);
  header.copy(file, 0);
  body.copy(file, 32);
  file.writeUInt32LE(0xd65f03c0, codeOff); // ret
  return file;
}
