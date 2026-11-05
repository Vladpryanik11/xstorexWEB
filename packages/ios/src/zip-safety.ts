import type { IpaRejectCode } from './codes.js';

export type ZipEntryMeta = { name: string; compressedSize: number; uncompressedSize: number };

export type ZipSafetyResult = { ok: true; appDir: string } | { ok: false; reason: IpaRejectCode };

export const MAX_ENTRIES = 200_000;
export const MAX_TOTAL_UNCOMPRESSED = 32 * 1024 ** 3;
/** Entries at most this large may have any compression ratio. */
export const BOMB_MIN_SIZE = 1024 ** 2;
export const MAX_RATIO = 200;

function isUnsafePath(name: string): boolean {
  if (name.length === 0 || name.includes('\\') || name.includes('\0')) return true;
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return true;
  return name.split('/').some((segment) => segment === '..');
}

function isBomb(e: ZipEntryMeta): boolean {
  if (e.uncompressedSize <= BOMB_MIN_SIZE) return false;
  return e.compressedSize <= 0 || e.uncompressedSize / e.compressedSize > MAX_RATIO;
}

const APP_ENTRY = /^Payload\/([^/]+\.app)\//;

/**
 * Checks the central directory before anything is decompressed: safe paths, no zip bomb, and
 * exactly one top-level `Payload/<name>.app/` bundle with an `Info.plist`.
 */
export function checkZipSafety(entries: ZipEntryMeta[]): ZipSafetyResult {
  if (entries.some((e) => isUnsafePath(e.name))) return { ok: false, reason: 'IPA_UNSAFE_PATH' };
  if (entries.length > MAX_ENTRIES) return { ok: false, reason: 'IPA_ZIP_BOMB' };
  let total = 0;
  for (const e of entries) {
    total += e.uncompressedSize;
    if (isBomb(e) || total > MAX_TOTAL_UNCOMPRESSED) return { ok: false, reason: 'IPA_ZIP_BOMB' };
  }
  const apps = new Set<string>();
  for (const e of entries) {
    const m = APP_ENTRY.exec(e.name);
    if (m?.[1]) apps.add(m[1]);
  }
  if (apps.size > 1) return { ok: false, reason: 'IPA_MANY_APPS' };
  const [app] = apps;
  if (!app) return { ok: false, reason: 'IPA_NO_APP' };
  const appDir = `Payload/${app}/`;
  if (!entries.some((e) => e.name === `${appDir}Info.plist`))
    return { ok: false, reason: 'IPA_NO_APP' };
  return { ok: true, appDir };
}
