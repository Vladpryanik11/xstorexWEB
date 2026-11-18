import type { Prisma } from '@xstore/db';
import { accessUntil, pickSubscription } from '@xstore/shared';

type Tx = Pick<Prisma.TransactionClient, 'subscription'>;

/**
 * The buyer's subscription a renewal or an admin grant goes to: the one `/access` shows
 * (`pickSubscription`), created when the buyer has none. After `claimProvisional` a buyer can own
 * several; the oldest is not necessarily the live one. Call under the `checkout:<userId>` lock.
 */
export async function buyerSubscription(tx: Tx, userId: string, now = new Date()) {
  const subscriptions = await tx.subscription.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      entitlements: { select: { startsAt: true, expiresAt: true, revokedAt: true } },
    },
  });
  const id = pickSubscription(
    subscriptions.map((s) => ({ id: s.id, rights: s.entitlements })),
    now,
  );
  if (id) return { id };
  return tx.subscription.create({ data: { userId }, select: { id: true } });
}

/** The live access end over all of a buyer's subscriptions: what `/access` shows. */
export async function buyerAccessUntil(
  db: Pick<Prisma.TransactionClient, 'entitlement'>,
  userId: string,
  now = new Date(),
): Promise<Date | null> {
  const rights = await db.entitlement.findMany({
    where: { subscription: { userId } },
    select: { subscriptionId: true, startsAt: true, expiresAt: true, revokedAt: true },
  });
  const bySubscription = new Map<string, typeof rights>();
  for (const r of rights) {
    bySubscription.set(r.subscriptionId, [...(bySubscription.get(r.subscriptionId) ?? []), r]);
  }
  let best: Date | null = null;
  for (const list of bySubscription.values()) {
    const until = accessUntil(list, now);
    if (until && (!best || until > best)) best = until;
  }
  return best;
}
