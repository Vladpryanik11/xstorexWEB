export type ChainRight = { id: string; startsAt: Date; expiresAt: Date };
export type ChainMove = {
  id: string;
  from: { startsAt: Date; expiresAt: Date };
  to: { startsAt: Date; expiresAt: Date };
};

/**
 * Refund rule (spec v2 §6, accepted by the owner 19.11): after the refunded right is revoked, the
 * live rights that started at or after it are pulled forward so access has no gap. Each keeps its
 * duration and starts at max(now, end of the previous live right); a right is only ever moved
 * earlier, never later. `live` holds the unrevoked rights of every subscription of the buyer (after
 * a claim there can be several); the refunded one may be among them and is skipped. Returns the
 * moves to apply.
 */
export function rechainAfterRefund(
  live: ChainRight[],
  refunded: Pick<ChainRight, 'id' | 'startsAt'>,
  now: Date,
): ChainMove[] {
  const others = live.filter((r) => r.id !== refunded.id);
  const before = refunded.startsAt.getTime();
  let cursor = now.getTime();
  for (const r of others) {
    if (r.startsAt.getTime() < before) cursor = Math.max(cursor, r.expiresAt.getTime());
  }
  const later = others
    .filter((r) => r.startsAt.getTime() >= before)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));
  const moves: ChainMove[] = [];
  for (const r of later) {
    const start = Math.min(r.startsAt.getTime(), cursor);
    const end = start + (r.expiresAt.getTime() - r.startsAt.getTime());
    if (start !== r.startsAt.getTime()) {
      moves.push({
        id: r.id,
        from: { startsAt: r.startsAt, expiresAt: r.expiresAt },
        to: { startsAt: new Date(start), expiresAt: new Date(end) },
      });
    }
    cursor = end;
  }
  return moves;
}
