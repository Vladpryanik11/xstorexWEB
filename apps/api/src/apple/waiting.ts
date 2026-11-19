import {
  accessUntil,
  type DeviceCertificateStatus,
  type WaitingDevice,
  type WaitingReason,
} from '@xstore/shared';

export const DAY_MS = 24 * 3600_000;
/** Files ending within this window put the device back into the list as `expiring`. */
export const EXPIRING_MS = 7 * DAY_MS;
/** Waits longer than this are highlighted. */
export const OVERDUE_MS = DAY_MS;

type Right = { startsAt: Date; expiresAt: Date; revokedAt: Date | null };
type Cert = {
  status: DeviceCertificateStatus;
  createdAt: Date;
  endedAt: Date | null;
  certNotAfter: Date;
  profileExpiresAt: Date;
};

/** A device's subscription has access right now. */
export const isLive = (rights: Right[], now: Date): boolean => accessUntil(rights, now) !== null;

/** End of the files: the earlier of the certificate and the profile. */
export const filesEnd = (c: Pick<Cert, 'certNotAfter' | 'profileExpiresAt'>): Date =>
  new Date(Math.min(c.certNotAfter.getTime(), c.profileExpiresAt.getTime()));

/**
 * Why a live device waits, or `null` when it is ready for more than a week. `certs` newest first;
 * `assignedAt` is when the device was bound.
 */
export function waitingState(
  certs: Cert[],
  assignedAt: Date,
  now: Date,
): Pick<WaitingDevice, 'reason' | 'since' | 'expiresAt' | 'overdue'> | null {
  const active = certs.find((c) => c.status === 'active');
  if (active) {
    const end = filesEnd(active);
    if (end.getTime() - now.getTime() > EXPIRING_MS) return null;
    return {
      reason: 'expiring',
      since: active.createdAt.toISOString(),
      expiresAt: end.toISOString(),
      overdue: false,
    };
  }
  const last = certs[0];
  const reason: WaitingReason =
    last?.status === 'revoked' || last?.status === 'expired' || last?.status === 'deleted'
      ? last.status
      : 'new';
  const since = reason === 'new' ? assignedAt : (last?.endedAt ?? last?.createdAt ?? assignedAt);
  return {
    reason,
    since: since.toISOString(),
    overdue: now.getTime() - since.getTime() > OVERDUE_MS,
  };
}
