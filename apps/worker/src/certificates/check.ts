import type { PrismaClient } from '@xstore/db';
import type { Keyring } from '@xstore/secrets';
import { decryptSecret } from '@xstore/secrets/decrypt';
import { checkRevocation, findIssuer, parseP12 } from '@xstore/signing';
import type { Logger } from 'pino';

export type CertificateCheckDeps = {
  db: PrismaClient;
  /** Null without a master key: only the dates are checked. */
  keyring: Keyring | null;
  fetchFn?: typeof fetch;
  /** OCSP responders the check may contact; default Apple's (`APPLE_OCSP_HOSTS`). */
  allowedHosts?: readonly string[];
  now: Date;
  logger: Logger;
};

export type CertificateCheckOutcome = {
  /** Certificates (one per fingerprint) asked about at Apple. */
  checked: number;
  /** Device files marked revoked. */
  revoked: number;
  /** Device files marked expired. */
  expired: number;
  /** Certificates whose state stayed unknown (nothing changed for them). */
  unknown: number;
};

/**
 * `certificates:check` (spec 2026-11-19 §6): ends working files whose dates passed, then asks
 * Apple's OCSP once per certificate and ends every device's files when it is revoked. The device
 * then waits again («Обновляем доступ»); the owner gets new files from the supplier. No letters.
 * Only files uploaded before `now` are touched, so an upload during the run is never ended.
 */
export async function runCertificateCheck(
  deps: CertificateCheckDeps,
): Promise<CertificateCheckOutcome> {
  const { db, keyring, now, logger } = deps;
  const outcome: CertificateCheckOutcome = { checked: 0, revoked: 0, expired: 0, unknown: 0 };
  const active = await db.deviceCertificate.findMany({
    where: { status: 'active', createdAt: { lte: now } },
    select: { id: true, certSha1: true, certNotAfter: true, profileExpiresAt: true },
  });

  const ended = active.filter(
    (c) => Math.min(c.certNotAfter.getTime(), c.profileExpiresAt.getTime()) <= now.getTime(),
  );
  if (ended.length > 0) {
    outcome.expired = await end(db, { id: { in: ended.map((c) => c.id) } }, 'expired', now);
  }
  if (!keyring) {
    if (active.length > ended.length) {
      logger.warn('certificates:check skipped OCSP: MASTER_KEY_CURRENT is not configured');
    }
    return outcome;
  }

  const endedIds = new Set(ended.map((c) => c.id));
  const fingerprints = [
    ...new Set(active.filter((c) => !endedIds.has(c.id)).map((c) => c.certSha1)),
  ];
  for (const certSha1 of fingerprints) {
    outcome.checked += 1;
    let state: Awaited<ReturnType<typeof checkRevocation>> = 'unknown';
    try {
      state = await revocationOf(db, keyring, certSha1, now, deps);
    } catch (err) {
      logger.warn(
        { certSha1, err: err instanceof Error ? err.name : 'Error' },
        'certificates:check could not read the certificate',
      );
    }
    if (state === 'revoked') {
      const count = await end(db, { certSha1, createdAt: { lte: now } }, 'revoked', now);
      outcome.revoked += count;
      logger.info({ certSha1, devices: count }, 'certificates:check certificate revoked');
    } else if (state === 'unknown') {
      outcome.unknown += 1;
      logger.warn({ certSha1 }, 'certificates:check revocation state unknown');
    }
  }
  return outcome;
}

async function revocationOf(
  db: PrismaClient,
  keyring: Keyring,
  certSha1: string,
  now: Date,
  deps: CertificateCheckDeps,
) {
  const row = await db.deviceCertificate.findFirst({
    where: { certSha1, status: 'active' },
    select: { p12Enc: true, p12PasswordEnc: true },
  });
  if (!row) return 'good' as const;
  const p12 = decryptSecret(row.p12Enc, keyring);
  const password = decryptSecret(row.p12PasswordEnc, keyring).toString('utf8');
  try {
    const parsed = await parseP12(p12, password);
    const issuer = findIssuer(parsed.certificate, parsed.chain);
    if (!issuer) return 'unknown' as const;
    return checkRevocation(parsed.certificate, issuer, {
      now,
      ...(deps.fetchFn ? { fetchFn: deps.fetchFn } : {}),
      ...(deps.allowedHosts ? { allowedHosts: deps.allowedHosts } : {}),
    });
  } finally {
    p12.fill(0);
  }
}

/**
 * Ends the matching active files and puts their devices back to waiting, in one transaction. A
 * device that got new files meanwhile keeps `active`: only devices left without files change.
 */
async function end(
  db: PrismaClient,
  where: { id?: { in: string[] }; certSha1?: string; createdAt?: { lte: Date } },
  status: 'expired' | 'revoked',
  now: Date,
): Promise<number> {
  return db.$transaction(async (tx) => {
    const rows = await tx.deviceCertificate.findMany({
      where: { ...where, status: 'active' },
      select: { id: true, deviceId: true },
    });
    if (rows.length === 0) return 0;
    const { count } = await tx.deviceCertificate.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, status: 'active' },
      data: { status, endedAt: now },
    });
    await tx.device.updateMany({
      where: {
        id: { in: rows.map((r) => r.deviceId) },
        status: 'active',
        certificates: { none: { status: 'active' } },
      },
      data: { status: 'processing' },
    });
    return count;
  });
}
