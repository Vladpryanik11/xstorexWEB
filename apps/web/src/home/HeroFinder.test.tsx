import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AppCard, Page } from '@xstore/shared';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HeroFinder } from './HeroFinder';

const app = (slug: string, name = `App ${slug}`) =>
  ({ slug, name, iconUrl: `/${slug}.png` }) as AppCard;
const page = (items: AppCard[], nextCursor: string | null = null): Page<AppCard> => ({
  items,
  nextCursor,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(search: (q: string) => Promise<Page<AppCard>>) {
  const utils = render(
    <HeroFinder
      lanes={{ removed: [app('telegram', 'Telegram')], premium: [app('okko', 'Okko')] }}
      lanesClassName="lanes"
      searchClassName="search"
      search={search}
    />,
  );
  const type = async (value: string) => {
    fireEvent.change(screen.getByRole('searchbox'), { target: { value } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
  };
  const count = () => utils.container.querySelector('[data-hero-count]') as HTMLElement;
  const hits = () =>
    [...utils.container.querySelectorAll('[data-hit]')].map((h) => h.getAttribute('href'));
  return { ...utils, type, count, hits };
}

// Owner 2026-11-24 (А3): a grey line under the search, the figure the owner confirmed.
it('says how many apps there are under the search', () => {
  const { count } = setup(async () => page([]));
  expect(count()).toHaveTextContent('200+ приложений');
});

// Owner 2026-11-24: typing a name moves that app to the middle of the lane.
it('finds an app of the lane at once, without asking the catalog', async () => {
  const search = vi.fn(async () => page([]));
  const { type, hits, count } = setup(search);
  await type('т');
  expect(hits()).toEqual([]);
  await type('телеграм');
  expect(new Set(hits())).toEqual(new Set(['/?app=telegram']));
  expect(search).not.toHaveBeenCalled();
  expect(count()).toHaveTextContent('200+ приложений');
  await type('');
  expect(hits()).toEqual([]);
});

it('asks the whole catalog for an app that is not in the lane and links to what it found', async () => {
  const search = vi.fn(async () => page([app('vk'), app('vkm')]));
  const { type, count, hits } = setup(search);
  await type(' вкм ');
  expect(search).toHaveBeenCalledTimes(1);
  expect(search).toHaveBeenCalledWith('вкм');
  expect(hits()).toEqual([]);
  const link = screen.getByRole('link', { name: /Нашли 2 в каталоге/ });
  expect(link).toHaveAttribute('href', '/search?q=%D0%B2%D0%BA%D0%BC');
  expect(count()).not.toHaveTextContent('200+');
});

it('asks once the typing stops, and shows only the answer to the last query', async () => {
  let resolveFirst: (p: Page<AppCard>) => void = () => {};
  const search = vi
    .fn<(q: string) => Promise<Page<AppCard>>>()
    .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
    .mockImplementationOnce(async () => page([app('new')]));
  const { type, count } = setup(search);
  await type('ст');
  await type('стар');
  await act(async () => resolveFirst(page([app('old'), app('old2'), app('old3')])));
  expect(count()).toHaveTextContent('Нашли 1 в каталоге');
});

it('says honestly when nothing is found', async () => {
  const { type, count } = setup(async () => page([]));
  await type('тикток');
  expect(count()).toHaveTextContent('Такого приложения пока нет в каталоге');
});

it('says when the search does not answer', async () => {
  const { type, count } = setup(async () => {
    throw new Error('down');
  });
  await type('вкм');
  expect(count()).toHaveTextContent('Поиск не ответил');
});

it('marks a longer answer with a plus', async () => {
  const { type, count } = setup(async () => page([app('a'), app('b')], 'next'));
  await type('ап');
  expect(count()).toHaveTextContent('Нашли 2+ в каталоге');
});

it('still submits to the search page on Enter', () => {
  setup(async () => page([]));
  expect(screen.getByRole('search')).toHaveAttribute('action', '/search');
});
