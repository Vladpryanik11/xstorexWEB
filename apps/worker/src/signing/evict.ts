import { readSetting } from '@xstore/db';
import { z } from 'zod';
import type { WorkerDeps } from '../deps.js';

const DAY = 86_400_000;
const GB = 1024 ** 3;
export const CACHE_TTL_DAYS_KEY = 'signing.cacheTtlDays';
export const CACHE_MAX_GB_KEY = 'signing.cacheMaxGb';

export type EvictOutcome = { ended: number; stale: number; trimmed: number };

/**
 * Removes signed copies (spec Н4 §6): every copy of device files that are no longer active
 * (replaced, revoked, expired, deleted) at once; copies unused for `signing.cacheTtlDays` (3);
 * then the least recently used while the total is over `signing.cacheMaxGb` (10). A copy with
 * a live unused install link, or one opened in the last 15 minutes, is kept by the last two rules. Objects go first, then rows, so a
 * row never points at nothing; a failed object delete leaves the row for the next run.
 */
export async function evictSignedBuilds(deps: WorkerDeps, now = new Date()): Promise<EvictOutcome> {
  const { db } = deps;
  const ttlDays = await readSetting(db, CACHE_TTL_DAYS_KEY, z.number().positive(), 3);
  const maxGb = await readSetting(db, CACHE_MAX_GB_KEY, z.number().positive(), 10);
  // A link not used yet, or opened less than the IPA link's 15 minutes ago (iOS is downloading).
  const downloading = new Date(now.getTime() - 15 * 60_000);
  const liveToken = {
    installTokens: {
      some: {
        OR: [{ usedAt: null, expiresAt: { gt: now } }, { usedAt: { gt: downloading } }],
      },
    },
  };

  const ended = await db.signedBuild.findMany({
    where: { deviceCertificate: { status: { not: 'active' } } },
    select: { id: true, key: true },
  });
  const stale = await db.signedBuild.findMany({
    where: {
      deviceCertificate: { status: 'active' },
      lastUsedAt: { lt: new Date(now.getTime() - ttlDays * DAY) },
      NOT: liveToken,
    },
    select: { id: true, key: true },
  });
  await remove(deps, [...ended, ...stale]);

  const left = await db.signedBuild.findMany({
    orderBy: { lastUsedAt: 'asc' },
    select: {
      id: true,
      key: true,
      sizeBytes: true,
      installTokens: { where: liveToken.installTokens.some, select: { tokenHash: true }, take: 1 },
    },
  });
  let total = left.reduce((sum, b) => sum + Number(b.sizeBytes), 0);
  const trim: { id: string; key: string }[] = [];
  for (const b of left) {
    if (total <= maxGb * GB) break;
    if (b.installTokens.length > 0) continue;
    trim.push(b);
    total -= Number(b.sizeBytes);
  }
  await remove(deps, trim);
  const outcome = { ended: ended.length, stale: stale.length, trimmed: trim.length };
  if (outcome.ended + outcome.stale + outcome.trimmed > 0) {
    deps.logger.info(outcome, 'signed copies removed');
  }
  return outcome;
}

async function remove(deps: WorkerDeps, builds: { id: string; key: string }[]): Promise<void> {
  const bucket = deps.s3.bucket('signed');
  for (const b of builds) {
    try {
      await deps.s3.remove(bucket, b.key);
    } catch (err) {
      deps.logger.warn({ buildId: b.id, err: (err as Error).message }, 'cannot remove signed copy');
      continue;
    }
    await deps.db.signedBuild.deleteMany({ where: { id: b.id } });
  }
}
