import type { Prisma } from '@xstore/db';

export type ClaimTx = Pick<
  Prisma.TransactionClient,
  '$executeRaw' | 'user' | 'subscription' | 'order' | 'device' | 'session'
>;

/**
 * Moves the purchases of every open provisional buyer who paid with `email` into the verified
 * buyer `verifiedUserId`, then closes those provisional accounts and drops their sessions. Runs in
 * the caller's transaction, after the email has been proven by a code.
 *
 * Subscriptions keep their ids, so entitlements and their dates stay as they are; orders and
 * devices follow their owner. Staff, verified accounts and blocked accounts are never sources.
 *
 * Lock order (always the same, so no cycle with the other lock holders):
 *   1. `hashtext(email)`                 — claims of one email serialize;
 *   2. `hashtext('checkout:' + userId)`  — per source buyer, by id: an in-flight checkout of a
 *                                          provisional buyer (`CheckoutService.openOrder`) ends first;
 *   3. `hashtext(subscriptionId)`        — per subscription, by id: the lock `applyPayment` takes,
 *                                          so a payment being applied finishes before its row moves.
 * `openOrder` takes only (checkoutKey →) 2 and `applyPayment` only 3, never 1, so neither can
 * wait on a lock this function holds while holding one it needs.
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

  for (const id of ids) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${id}`}))`;
  }
  const subscriptions = await tx.subscription.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  for (const s of subscriptions) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${s.id}))`;
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
