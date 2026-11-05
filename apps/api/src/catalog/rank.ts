import type { CollectionSource } from '@xstore/shared';

/** What ranking needs to know about one visible app. */
export type RankInput = {
  id: string;
  downloads30d: number;
  downloadsLast7d: number;
  downloadsPrev7d: number;
  rating?: number | null;
  ratingCount?: number | null;
  latestPublishedAt: Date | null;
};

export type RankItem = { appId: string; position: number; pinned: boolean };

export type RankOptions = {
  /** Setting `catalog.topRatedMinVotes`. */
  topRatedMinVotes?: number;
};

export const DEFAULT_TOP_RATED_MIN_VOTES = 20;

type Compare = (x: RankInput, y: RankInput) => number;

const byId = (x: { id: string }, y: { id: string }) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
const desc =
  (f: (r: RankInput) => number): Compare =>
  (x, y) =>
    f(y) - f(x);
const time = (d: Date | null) => d?.getTime() ?? Number.NEGATIVE_INFINITY;

const COMPARE: Record<Exclude<CollectionSource, 'manual'>, Compare[]> = {
  top_downloads: [desc((r) => r.downloads30d)],
  trending: [desc((r) => r.downloadsLast7d - r.downloadsPrev7d), desc((r) => r.downloadsLast7d)],
  top_rated: [desc((r) => r.rating ?? 0)],
  recently_updated: [desc((r) => time(r.latestPublishedAt))],
};

const byPosition = (x: RankItem, y: RankItem) =>
  x.position - y.position || (x.appId < y.appId ? -1 : x.appId > y.appId ? 1 : 0);

/**
 * Orders a collection and returns up to `limit` app ids. `apps` are the apps that may appear
 * (already filtered to visible ones); items whose app is not among them are skipped. Pinned items
 * come first in `position` order for every source; ties break by id.
 */
export function rankCollection(
  source: CollectionSource,
  apps: RankInput[],
  items: RankItem[],
  limit: number,
  opts: RankOptions = {},
): string[] {
  if (limit <= 0) return [];
  const known = new Map(apps.map((a) => [a.id, a]));
  const present = items.filter((i) => known.has(i.appId));
  const pinned = present
    .filter((i) => i.pinned)
    .sort(byPosition)
    .map((i) => i.appId);
  const taken = new Set(pinned);

  let rest: string[];
  if (source === 'manual') {
    rest = present
      .filter((i) => !i.pinned)
      .sort(byPosition)
      .map((i) => i.appId);
  } else {
    const minVotes = opts.topRatedMinVotes ?? DEFAULT_TOP_RATED_MIN_VOTES;
    const eligible =
      source === 'top_rated'
        ? apps.filter((a) => a.rating != null && (a.ratingCount ?? 0) >= minVotes)
        : apps;
    const compare = [...COMPARE[source], byId];
    rest = eligible
      .filter((a) => !taken.has(a.id))
      .sort((x, y) => {
        for (const c of compare) {
          const r = c(x, y);
          if (r !== 0) return r;
        }
        return 0;
      })
      .map((a) => a.id);
  }
  return [...pinned, ...rest.filter((id) => !taken.has(id))].slice(0, limit);
}
