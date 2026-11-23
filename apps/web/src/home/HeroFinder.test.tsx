import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AppCard, Page } from '@xstore/shared';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HeroFinder } from './HeroFinder';

const app = (slug: string) => ({ slug, name: `App ${slug}`, iconUrl: `/${slug}.png` }) as AppCard;
const page = (items: AppCard[], nextCursor: string | null = null): Page<AppCard> => ({
  items,
  nextCursor,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(search: (q: string) => Promise<Page<AppCard>>) {
  const utils = render(
    <HeroFinder
      lanes={{ removed: [app('a')], premium: [app('p')] }}
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
  const area = () => utils.container.querySelector('[data-hero-finder]') as HTMLElement;
  return { ...utils, type, area };
}

// Spec 2026-11-23-home-first-screen §3.4 (owner 2026-11-23 18:16, variant В).
it('keeps the lanes until two letters are typed', async () => {
  const search = vi.fn(async () => page([]));
  const { type, area } = setup(search);
  await type('в');
  expect(search).not.toHaveBeenCalled();
  expect(area()).not.toHaveAttribute('data-searching');
  expect(screen.queryByTestId('hero-dock')).toBeNull();
});

it('swaps the lanes for a shelf of the apps found in the whole catalog', async () => {
  const search = vi.fn(async () => page([app('vk'), app('vkm')]));
  const { type, area } = setup(search);
  await type(' вк ');
  expect(search).toHaveBeenCalledTimes(1);
  expect(search).toHaveBeenCalledWith('вк');
  expect(area()).toHaveAttribute('data-searching');
  const dock = screen.getByTestId('hero-dock');
  const links = [...dock.querySelectorAll('a[data-dock-app]')];
  expect(links.map((l) => l.getAttribute('href'))).toEqual(['/?app=vk', '/?app=vkm']);
  expect(dock).toHaveTextContent('App vk');
  expect(screen.getByRole('search')).toHaveTextContent('Нашли 2');
});

it('asks once the typing stops, and shows only the answer to the last query', async () => {
  let resolveFirst: (p: Page<AppCard>) => void = () => {};
  const search = vi
    .fn<(q: string) => Promise<Page<AppCard>>>()
    .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
    .mockImplementationOnce(async () => page([app('new')]));
  const { type } = setup(search);
  await type('ст');
  await type('стар');
  await act(async () => resolveFirst(page([app('old')])));
  const dock = screen.getByTestId('hero-dock');
  expect(dock).toHaveTextContent('App new');
  expect(dock).not.toHaveTextContent('App old');
});

it('says honestly when nothing is found, with a way to the whole catalog', async () => {
  const { type } = setup(async () => page([]));
  await type('тикток');
  const dock = screen.getByTestId('hero-dock');
  expect(dock).toHaveTextContent('Такого приложения пока нет в каталоге');
  expect(dock.querySelector('a')?.getAttribute('href')).toBe('/catalog');
});

it('offers the search page when the search does not answer', async () => {
  const { type } = setup(async () => {
    throw new Error('down');
  });
  await type('вк');
  const dock = screen.getByTestId('hero-dock');
  expect(dock).toHaveTextContent('Поиск не ответил');
  expect(dock.querySelector('a')?.getAttribute('href')).toBe('/search?q=%D0%B2%D0%BA');
});

it('marks a longer answer with a plus and brings the lanes back when the field is cleared', async () => {
  const { type, area } = setup(async () => page([app('a'), app('b')], 'next'));
  await type('ап');
  expect(screen.getByRole('search')).toHaveTextContent('Нашли 2+');
  await type('');
  expect(area()).not.toHaveAttribute('data-searching');
  expect(screen.queryByTestId('hero-dock')).toBeNull();
});

it('still submits to the search page on Enter', () => {
  setup(async () => page([]));
  expect(screen.getByRole('search')).toHaveAttribute('action', '/search');
});
