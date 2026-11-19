import type { Prisma } from '@xstore/db';

export type ClaimTx = Pick<
  Prisma.TransactionClient,
  '$executeRaw' | 'user' | 'subscription' | 'order' | 'device' | 'session' | 'entitlement'
>;

/**
 * Moves the purchases of every open provisional buyer who paid with `email` into the verified
 * buyer `verifiedUserId`, then closes those provisional accounts and drops their sessions. Runs in
 * the caller's transaction, after the email has been proven by a code.
 *
 * Subscriptions keep their ids; orders and devices follow their owner. Rights that have already
 * started keep their dates. Rights of the moved subscriptions that have not started yet (a
 * renewal or a grant waiting after the guest's period) move to the end of the buyer's chain,
 * keeping their length, so no two rights of one buyer overlap. Staff, verified accounts and
 * blocked accounts are never sources.
 *
 * Lock order (always the same, so no cycle with the other lock holders):
 *   1. `hashtext(email)`                 — claims of one email serialize;
 *   2. `hashtext('checkout:' + userId)`  — per buyer, by id, over the sources and the verified
 *                                          buyer in one sorted list: an in-flight checkout
 *                                          (`CheckoutService.openOrder`) or device bind
 *                                          (`EnrollmentService`) of any of them ends first;
 *   3. `hashtext(subscriptionId)`        — per subscription, by id, over the moved subscriptions and
 *                                          the verified buyer's own in one sorted list: the lock
 *                                          `applyPayment` takes, so a payment being applied finishes
 *                                          before its row moves or the buyer's chain is read.
 * `openOrder` takes only (checkoutKey →) 2, the device bind 2 → 3 and `applyPayment` only 3,
 * never 1, so none can wait on a lock this function holds while holding one it needs. The admin
 * grant and refund (`AdminBillingService`) take 1 → 2 → 3 in this same order.
 *
 * Stage 1 allows one device per buyer. If the merge would leave two different devices bound,
 * the verified buyer's own device stays bound (without one, the moved device bound most
 * recently); every moved subscription bound to another device is unbound. Its `Device` row still
 * moves to the buyer, so connecting that iPhone again gives `DEVICE_LIMIT`, not `DEVICE_OWNED`.
 */
export async function claimProvisional(
  tx: ClaimTx,
  verifiedUserId: string,
  email: string,
): Promise<{ moved: number }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;

  const target = await tx.user.findUnique({
    where: { id: verifiedUserId },
    select: { role: true, isProvisional: true, blockedAt: true },
  });
  if (target?.role !== 'user' || target.isProvisional || target.blockedAt) {
    throw new Error('claimProvisional: target is not an open verified buyer');
  }

  const sources = await tx.user.findMany({
    where: {
      isProvisional: true,
      checkoutEmail: email,
      email: null,
      role: 'user',
      blockedAt: null,
      id: { not: verifiedUserId },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (sources.length === 0) return { moved: 0 };
  const ids = sources.map((s) => s.id);

  for (const id of [...ids, verifiedUserId].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${id}`}))`;
  }
  // The buyer's own subscriptions are locked too: their rights set the chain end below, and a
  // payment applied to one of them meanwhile would overlap a right moved after that end.
  const subscriptions = await tx.subscription.findMany({
    where: { userId: { in: [...ids, verifiedUserId] } },
    select: { id: true, userId: true, deviceId: true, assignedAt: true },
    orderBy: { id: 'asc' },
  });
  for (const s of subscriptions) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${s.id}))`;
  }

  await chainFutureRights(
    tx,
    subscriptions.map((s) => s.id),
    subscriptions.filter((s) => s.userId !== verifiedUserId).map((s) => s.id),
  );

  const unbind = conflictingBindings(subscriptions, verifiedUserId);
  if (unbind.length > 0) {
    await tx.subscription.updateMany({
      where: { id: { in: unbind } },
      data: { deviceId: null, assignedAt: null },
    });
  }

  const owned = { userId: { in: ids } };
  const moved = await tx.subscription.updateMany({
    where: owned,
    data: { userId: verifiedUserId },
  });
  await tx.order.updateMany({ where: owned, data: { userId: verifiedUserId } });
  await tx.device.updateMany({ where: owned, data: { userId: verifiedUserId } });
  // Sessions go before the accounts close; enrollment sessions cascade with them.
  await tx.session.deleteMany({ where: owned });
  await tx.user.updateMany({ where: { id: { in: ids } }, data: { blockedAt: new Date() } });
  return { moved: moved.count };
}

/**
 * Moved subscriptions whose device differs from the one the merged buyer keeps: the verified
 * buyer's own bound device, otherwise the moved device bound most recently.
 */
function conflictingBindings(
  subscriptions: {
    id: string;
    userId: string;
    deviceId: string | null;
    assignedAt: Date | null;
  }[],
  verifiedUserId: string,
): string[] {
  const bound = subscriptions
    .filter((s) => s.deviceId !== null)
    .sort((a, b) => {
      const ownFirst = Number(b.userId === verifiedUserId) - Number(a.userId === verifiedUserId);
      return ownFirst || (b.assignedAt?.getTime() ?? 0) - (a.assignedAt?.getTime() ?? 0);
    });
  const keep = bound[0]?.deviceId;
  return bound.filter((s) => s.userId !== verifiedUserId && s.deviceId !== keep).map((s) => s.id);
}

/**
 * Puts the not-yet-started live rights of `movedIds` after the verified buyer's chain: in start
 * order, each starts at `max(startsAt, chain end)` and keeps its length; the chain end is the
 * latest end of the buyer's own live rights and the moved rights that have already started.
 * `lockedIds` are all subscriptions involved (the buyer's own and the moved), already locked.
 */
async function chainFutureRights(
  tx: ClaimTx,
  lockedIds: string[],
  movedIds: string[],
  now = new Date(),
): Promise<void> {
  if (movedIds.length === 0) return;
  const rights = await tx.entitlement.findMany({
    where: { revokedAt: null, subscriptionId: { in: lockedIds } },
    select: { id: true, subscriptionId: true, startsAt: true, expiresAt: true },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  });
  const moved = new Set(movedIds);
  const future = rights.filter(
    (r) => moved.has(r.subscriptionId) && r.startsAt.getTime() > now.getTime(),
  );
  const futureIds = new Set(future.map((r) => r.id));
  let end = 0;
  for (const r of rights) {
    if (!futureIds.has(r.id)) end = Math.max(end, r.expiresAt.getTime());
  }
  for (const r of future) {
    const length = r.expiresAt.getTime() - r.startsAt.getTime();
    const start = Math.max(r.startsAt.getTime(), end);
    if (start !== r.startsAt.getTime()) {
      await tx.entitlement.update({
        where: { id: r.id },
        data: { startsAt: new Date(start), expiresAt: new Date(start + length) },
      });
    }
    end = Math.max(end, start + length);
  }
}
