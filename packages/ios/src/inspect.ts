import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PNG } from 'pngjs';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { cgbiToPng } from './cgbi.js';
import { type IpaRejectCode, IpaRejectError } from './codes.js';
import { type IpaInfo, readInfo } from './info-plist.js';
import { readEncryptionFromFile } from './macho.js';
import { parsePlist } from './plist.js';
import { checkZipSafety, MAX_ENTRIES, type ZipEntryMeta } from './zip-safety.js';

export type InspectResult =
  | {
      ok: true;
      info: IpaInfo;
      encrypted: boolean;
      sizeBytes: number;
      sha256: string;
      /** Standard (non-CgBI) PNG of the largest app icon, or `null` when none is usable. */
      iconPng: Buffer | null;
    }
  | { ok: false; reason: IpaRejectCode };

const MAX_PLIST_BYTES = 8 * 1024 ** 2;
const MAX_ICON_BYTES = 5 * 1024 ** 2;
const MAX_ICON_CANDIDATES = 50;

/** File-system errors (disk full, permissions) are ours to retry, not the archive's fault. */
function isSystemError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'syscall' in err;
}

function rethrowOr(reason: IpaRejectCode) {
  return (err: unknown): never => {
    if (isSystemError(err)) throw err;
    throw new IpaRejectError(reason);
  };
}

async function readEntry(zip: ZipFile, entry: Entry, maxBytes: number): Promise<Buffer> {
  if (entry.uncompressedSize > maxBytes) throw new Error('entry too large');
  const stream = await zip.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let total = 0;
  await pipeline(
    stream,
    new Writable({
      write(chunk: Buffer, _enc, done) {
        total += chunk.length;
        if (total > maxBytes) return done(new Error('entry too large'));
        chunks.push(chunk);
        done();
      },
    }),
  );
  return Buffer.concat(chunks);
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Icon files at the top of the bundle, best guesses first. */
function iconCandidates(files: string[], iconNames: string[]): string[] {
  const pngs = files.filter((f) => /\.png$/i.test(f));
  const named = new Set<string>();
  for (const name of iconNames) {
    const base = escapeRegExp(name.replace(/\.png$/i, ''));
    const re = new RegExp(`^${base}(@[1-4]x)?(~(ipad|iphone))?\\.png$`, 'i');
    for (const f of pngs) if (re.test(f)) named.add(f);
  }
  const list = named.size > 0 ? [...named] : pngs.filter((f) => /^(AppIcon|Icon)/i.test(f));
  return list.slice(0, MAX_ICON_CANDIDATES);
}

function pngSize(png: Buffer): number {
  // A standard PNG starts with IHDR: width at 16, height at 20.
  if (png.length < 24 || png.toString('latin1', 12, 16) !== 'IHDR') return 0;
  return png.readUInt32BE(16) * png.readUInt32BE(20);
}

async function extractIcon(
  zip: ZipFile,
  entries: Map<string, Entry>,
  appDir: string,
  iconNames: string[],
): Promise<Buffer | null> {
  const topLevel = [...entries.keys()]
    .filter((n) => n.startsWith(appDir) && !n.slice(appDir.length).includes('/'))
    .map((n) => n.slice(appDir.length));
  const decoded: { png: Buffer; area: number }[] = [];
  for (const file of iconCandidates(topLevel, iconNames)) {
    const entry = entries.get(appDir + file);
    if (!entry || entry.uncompressedSize > MAX_ICON_BYTES) continue;
    try {
      const png = cgbiToPng(await readEntry(zip, entry, MAX_ICON_BYTES));
      decoded.push({ png, area: pngSize(png) });
    } catch (err) {
      if (isSystemError(err)) throw err;
    }
  }
  decoded.sort((a, b) => b.area - a.area);
  for (const { png } of decoded) {
    try {
      PNG.sync.read(png);
      return png;
    } catch {
      // A broken icon is skipped; the next best one is tried.
    }
  }
  return null;
}

async function inspectZip(
  zip: ZipFile,
  tmpDir: string,
): Promise<Omit<Extract<InspectResult, { ok: true }>, 'sizeBytes' | 'sha256'>> {
  if (zip.entryCount > MAX_ENTRIES) throw new IpaRejectError('IPA_ZIP_BOMB');
  const entries = new Map<string, Entry>();
  const metas: ZipEntryMeta[] = [];
  try {
    for await (const entry of zip.eachEntry()) {
      // decodeStrings is off so yauzl does not throw on unsafe names; checkZipSafety judges them.
      const name = yauzl.getFileNameLowLevel(
        entry.generalPurposeBitFlag,
        entry.fileNameRaw,
        entry.extraFields,
        false,
      );
      // Two entries with one name could show the checker one file and the installer another.
      if (entries.has(name)) throw new IpaRejectError('IPA_UNSAFE_PATH');
      entries.set(name, entry);
      metas.push({
        name,
        compressedSize: entry.compressedSize,
        uncompressedSize: entry.uncompressedSize,
      });
    }
  } catch (err) {
    if (err instanceof IpaRejectError) throw err;
    rethrowOr('IPA_NOT_ZIP')(err);
  }

  const safety = checkZipSafety(metas);
  if (!safety.ok) throw new IpaRejectError(safety.reason);
  const { appDir } = safety;

  const plistEntry = entries.get(`${appDir}Info.plist`);
  if (!plistEntry) throw new IpaRejectError('IPA_NO_APP');
  const plistBytes = await readEntry(zip, plistEntry, MAX_PLIST_BYTES).catch(
    rethrowOr('IPA_BAD_PLIST'),
  );
  let info: IpaInfo;
  try {
    info = readInfo(parsePlist(plistBytes));
  } catch {
    throw new IpaRejectError('IPA_BAD_PLIST');
  }

  const binEntry = entries.get(appDir + info.executable);
  if (!binEntry) throw new IpaRejectError('IPA_NO_BINARY');
  const work = await mkdtemp(join(tmpDir, 'inspect-'));
  let encrypted: boolean;
  try {
    const binPath = join(work, 'executable');
    const stream = await zip.openReadStreamPromise(binEntry).catch(rethrowOr('IPA_NOT_ZIP'));
    await pipeline(stream, createWriteStream(binPath)).catch(rethrowOr('IPA_NOT_ZIP'));
    encrypted = (await readEncryptionFromFile(binPath).catch(rethrowOr('IPA_NO_BINARY'))).encrypted;
  } finally {
    await rm(work, { recursive: true, force: true });
  }

  const iconPng = await extractIcon(zip, entries, appDir, info.iconNames);
  return { ok: true, info, encrypted, iconPng };
}

/**
 * Inspects an IPA without extracting it: reads the central directory, checks it for unsafe
 * paths and zip bombs, parses `Info.plist`, checks FairPlay on the main executable (the only
 * file written to disk, under `tmpDir`, removed afterwards) and extracts the app icon.
 * Rejections come back as `{ ok: false, reason }`; I/O failures of the host throw.
 */
export async function inspectIpa(path: string, tmpDir: string): Promise<InspectResult> {
  const { size } = await stat(path);
  let zip: ZipFile;
  try {
    zip = await yauzl.openPromise(path, {
      lazyEntries: true,
      autoClose: false,
      decodeStrings: false,
      validateEntrySizes: true,
    });
  } catch (err) {
    if (isSystemError(err)) throw err;
    return { ok: false, reason: 'IPA_NOT_ZIP' };
  }
  try {
    const result = await inspectZip(zip, tmpDir);
    return { ...result, sizeBytes: size, sha256: await sha256File(path) };
  } catch (err) {
    if (err instanceof IpaRejectError) return { ok: false, reason: err.reason };
    throw err;
  } finally {
    zip.close();
  }
}
