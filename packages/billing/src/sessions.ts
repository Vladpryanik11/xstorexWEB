import type { PrismaClient } from '@xstore/db';
import { accessUntil, userSessionExpiry } from '@xstore/shared';

type Db = Pick<PrismaClient, 'entitlement' | 'session'>;

/** `max(now + 30 days, end of paid access + 7 days)` over all the user's subscriptions. */
export async function userSessionEnd(db: Db, userId: string, now = new Date()): Promise<Date> {
  const rights = await db.entitlement.findMany({
    where: { subscription: { userId } },
    select: { startsAt: true, expiresAt: true, revokedAt: true },
  });
  return userSessionExpiry(now, accessUntil(rights, now));
}

/**
 * After access is granted (webhook, reconcile, expiry check, admin grant): moves every live buyer
 * session of the user up to `userSessionEnd`. Never shortens a session and never revives an
 * expired one.
 */
export async function extendUserSessions(db: Db, userId: string, now = new Date()): Promise<void> {
  const expiresAt = await userSessionEnd(db, userId, now);
  await db.session.updateMany({
    where: { userId, kind: 'user', expiresAt: { gt: now, lt: expiresAt } },
    data: { expiresAt },
  });
}
