import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bplistCreator from 'bplist-creator';
import plist from 'plist';
import { ZipFile } from 'yazl';
import { buildMachO } from './build-macho.js';

export type BuildIpaOptions = {
  /** Info.plist contents. */
  info?: Record<string, unknown>;
  /** Write Info.plist as a binary plist. */
  binaryPlist?: boolean;
  /** Raw Info.plist bytes; wins over `info`. */
  infoRaw?: Buffer;
  /** Main executable; defaults to an unencrypted arm64 binary. `null` leaves it out. */
  binary?: Buffer | null;
  /** Bundle directory name without `.app`. */
  appName?: string;
  /** Extra files, by path inside the archive. */
  files?: Record<string, Buffer>;
};

export const defaultInfo = {
  CFBundleDisplayName: 'Тест',
  CFBundleIdentifier: 'ru.test.app',
  CFBundleShortVersionString: '1.2',
  CFBundleVersion: '45',
  MinimumOSVersion: '15.0',
  UIDeviceFamily: [1, 2],
  CFBundleExecutable: 'Test',
};

export function buildIpaBuffer(opts: BuildIpaOptions = {}): Promise<Buffer> {
  const appDir = `Payload/${opts.appName ?? 'Test'}.app/`;
  const info = opts.info ?? defaultInfo;
  const zip = new ZipFile();
  const infoBytes =
    opts.infoRaw ??
    (opts.binaryPlist
      ? bplistCreator(info)
      : Buffer.from(plist.build(info as plist.PlistObject), 'utf8'));
  zip.addBuffer(infoBytes, `${appDir}Info.plist`);
  const executable = typeof info.CFBundleExecutable === 'string' ? info.CFBundleExecutable : 'Test';
  const binary = opts.binary === undefined ? buildMachO({ cryptid: 0 }) : opts.binary;
  if (binary) zip.addBuffer(binary, `${appDir}${executable}`);
  for (const [name, data] of Object.entries(opts.files ?? {})) zip.addBuffer(data, name);
  zip.end();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Renames every occurrence of `from` in the archive bytes (local headers and the central
 * directory). yazl refuses unsafe names, so hostile archives are made by patching a placeholder
 * of the same length.
 */
export function renameEntry(zip: Buffer, from: string, to: string): Buffer {
  const a = Buffer.from(from, 'utf8');
  const b = Buffer.from(to, 'utf8');
  if (a.length !== b.length) throw new Error('names must have the same byte length');
  const out = Buffer.from(zip);
  let at = out.indexOf(a);
  while (at !== -1) {
    b.copy(out, at);
    at = out.indexOf(a, at + b.length);
  }
  return out;
}

export async function writeTemp(data: Buffer, dir?: string): Promise<string> {
  const target = dir ?? (await mkdtemp(join(tmpdir(), 'xstore-ipa-test-')));
  const path = join(target, `${Math.random().toString(36).slice(2)}.ipa`);
  await writeFile(path, data);
  return path;
}

/** Builds an IPA and writes it to a file; returns its path. */
export async function buildIpa(opts: BuildIpaOptions = {}, dir?: string): Promise<string> {
  return writeTemp(await buildIpaBuffer(opts), dir);
}
