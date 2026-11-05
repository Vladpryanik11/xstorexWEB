import { describe, expect, it } from 'vitest';
import { type RankInput, rankCollection } from './rank.js';

const DAY = 86_400_000;
const base = new Date('2026-11-01T00:00:00Z').getTime();

function app(id: string, over: Partial<RankInput> = {}): RankInput {
  return {
    id,
    downloads30d: 0,
    downloadsLast7d: 0,
    downloadsPrev7d: 0,
    rating: null,
    ratingCount: null,
    latestPublishedAt: new Date(base),
    ...over,
  };
}
const a = (n: number) => app('a', { downloads30d: n });
const b = (n: number) => app('b', { downloads30d: n });
const c = (n: number) => app('c', { downloads30d: n });

describe('rankCollection', () => {
  it('pins first, then ranks by downloads', () => {
    expect(
      rankCollection(
        'top_downloads',
        [a(10), b(50), c(5)],
        [{ appId: 'c', position: 0, pinned: true }],
        3,
      ),
    ).toEqual(['c', 'b', 'a']);
  });

  it('keeps several pins in position order and cuts to the limit', () => {
    const items = [
      { appId: 'a', position: 2, pinned: true },
      { appId: 'c', position: 1, pinned: true },
    ];
    expect(rankCollection('top_downloads', [a(10), b(50), c(5)], items, 2)).toEqual(['c', 'a']);
  });

  it('trending ranks by weekly growth', () => {
    const apps = [
      app('a', { downloadsLast7d: 100, downloadsPrev7d: 90 }), // +10
      app('b', { downloadsLast7d: 30, downloadsPrev7d: 0 }), // +30
      app('c', { downloadsLast7d: 50, downloadsPrev7d: 20 }), // +30, more downloads
      app('d', { downloadsLast7d: 0, downloadsPrev7d: 40 }), // −40
    ];
    expect(rankCollection('trending', apps, [], 4)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('top_rated ignores apps with few votes', () => {
    const apps = [
      app('a', { rating: 4.2, ratingCount: 500 }),
      app('b', { rating: 5, ratingCount: 5 }),
      app('c', { rating: 4.8, ratingCount: 20 }),
      app('d', { rating: null, ratingCount: null }),
    ];
    expect(rankCollection('top_rated', apps, [], 10)).toEqual(['c', 'a']);
  });

  it('top_rated takes the vote threshold from the caller', () => {
    const apps = [
      app('a', { rating: 4.2, ratingCount: 500 }),
      app('b', { rating: 5, ratingCount: 5 }),
    ];
    expect(rankCollection('top_rated', apps, [], 10, { topRatedMinVotes: 5 })).toEqual(['b', 'a']);
  });

  it('top_rated still shows a pinned app with few votes', () => {
    const apps = [
      app('a', { rating: 4.2, ratingCount: 500 }),
      app('b', { rating: 5, ratingCount: 1 }),
    ];
    expect(
      rankCollection('top_rated', apps, [{ appId: 'b', position: 0, pinned: true }], 10),
    ).toEqual(['b', 'a']);
  });

  it('recently_updated ranks by the latest published version', () => {
    const apps = [
      app('a', { latestPublishedAt: new Date(base) }),
      app('b', { latestPublishedAt: new Date(base + 2 * DAY) }),
      app('c', { latestPublishedAt: new Date(base + DAY) }),
    ];
    expect(rankCollection('recently_updated', apps, [], 3)).toEqual(['b', 'c', 'a']);
  });

  it('manual follows positions, pins first, and skips items without an app', () => {
    const items = [
      { appId: 'a', position: 0, pinned: false },
      { appId: 'b', position: 1, pinned: false },
      { appId: 'gone', position: 2, pinned: true },
      { appId: 'c', position: 3, pinned: true },
    ];
    expect(rankCollection('manual', [a(0), b(0), c(0)], items, 10)).toEqual(['c', 'a', 'b']);
  });

  it('manual leaves out apps that are not in the collection', () => {
    expect(
      rankCollection('manual', [a(0), b(0)], [{ appId: 'b', position: 0, pinned: false }], 10),
    ).toEqual(['b']);
  });

  it('breaks ties by id', () => {
    expect(rankCollection('top_downloads', [c(1), a(1), b(1)], [], 3)).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing for a zero limit', () => {
    expect(rankCollection('top_downloads', [a(1)], [], 0)).toEqual([]);
  });
});
