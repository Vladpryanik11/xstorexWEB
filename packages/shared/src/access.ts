export type RightLike = { startsAt: Date; expiresAt: Date; revokedAt: Date | null };

const DAY_MS = 24 * 60 * 60 * 1000;

const live = (rights: RightLike[]) => rights.filter((r) => r.revokedAt === null);

export function nextWindow(
  existing: RightLike[],
  durationDays: number,
  paidAt: Date,
): { startsAt: Date; expiresAt: Date } {
  let start = paidAt.getTime();
  for (const r of live(existing)) {
    start = Math.max(start, r.expiresAt.getTime());
  }
  return { startsAt: new Date(start), expiresAt: new Date(start + durationDays * DAY_MS) };
}

export function accessUntil(rights: RightLike[], now: Date): Date | null {
  const list = live(rights);
  const t = now.getTime();
  let end: number | null = null;
  for (const r of list) {
    if (r.startsAt.getTime() <= t && t < r.expiresAt.getTime()) {
      end = Math.max(end ?? 0, r.expiresAt.getTime());
    }
  }
  if (end === null) return null;
  let extended = true;
  while (extended) {
    extended = false;
    for (const r of list) {
      if (r.startsAt.getTime() <= end && r.expiresAt.getTime() > end) {
        end = r.expiresAt.getTime();
        extended = true;
      }
    }
  }
  return new Date(end);
}

export function userSessionExpiry(now: Date, until: Date | null): Date {
  const base = now.getTime() + 30 * DAY_MS;
  const fromAccess = until ? until.getTime() + 7 * DAY_MS : 0;
  return new Date(Math.max(base, fromAccess));
}

export type AccessState =
  | { kind: 'none' }
  | { kind: 'payment_pending'; orderId: string }
  | { kind: 'active'; until: Date; subscriptionId: string; deviceReady: boolean };

export function accessState(input: {
  signedIn: boolean;
  subscriptions: { id: string; rights: RightLike[]; deviceReady: boolean }[];
  pendingOrderId: string | null;
  now: Date;
}): AccessState {
  let best: { until: Date; subscriptionId: string; deviceReady: boolean } | null = null;
  for (const s of input.subscriptions) {
    const until = accessUntil(s.rights, input.now);
    if (until && (!best || until > best.until)) {
      best = { until, subscriptionId: s.id, deviceReady: s.deviceReady };
    }
  }
  if (best) return { kind: 'active', ...best };
  if (input.pendingOrderId) return { kind: 'payment_pending', orderId: input.pendingOrderId };
  return { kind: 'none' };
}

/**
 * The subscription a renewal or an admin grant goes to: the one `accessState` shows (the latest
 * live access end); without live access, the one with the most recent right; with no rights at
 * all, the first given. `null` only when there are no subscriptions (the caller creates one).
 */
export function pickSubscription(
  subscriptions: { id: string; rights: RightLike[] }[],
  now: Date,
): string | null {
  let live: { id: string; until: Date } | null = null;
  let recent: { id: string; startsAt: number } | null = null;
  for (const s of subscriptions) {
    const until = accessUntil(s.rights, now);
    if (until && (!live || until > live.until)) live = { id: s.id, until };
    for (const r of s.rights) {
      const t = r.startsAt.getTime();
      if (!recent || t > recent.startsAt) recent = { id: s.id, startsAt: t };
    }
  }
  return live?.id ?? recent?.id ?? subscriptions[0]?.id ?? null;
}

const ruDate = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatRuDate(d: Date): string {
  return ruDate.format(d).replace(/\s?г\.$/, '');
}
