import { act, fireEvent, render } from '@testing-library/react';
import type { AppCard } from '@xstore/shared';
import { expect, it } from 'vitest';
import { dockScales, dockShifts, HeroLanes, laneApps, matchApp, matchApps } from './HeroLanes';

const app = (slug: string, iconUrl?: string, name = `App ${slug}`) =>
  ({ slug, name, iconUrl }) as AppCard;

it('repeats the apps of a section until the lane is full, skipping apps without an icon', () => {
  expect(
    laneApps([app('a', '/a.png'), app('b'), app('c', '/c.png')], 5).map((a) => a.slug),
  ).toEqual(['a', 'c', 'a', 'c', 'a']);
  expect(laneApps([app('b')], 5)).toEqual([]);
});

// Owner 2026-11-24: one lane without a caption, removed and premium apps taking turns.
it('draws one lane of removed and premium apps in turn, without a caption', () => {
  const { container } = render(
    <HeroLanes
      removed={[app('a', '/a.png'), app('b', '/b.png'), app('c', '/c.png')]}
      premium={[app('p', '/p.png'), app('a', '/a.png')]}
    />,
  );
  expect(container.querySelectorAll('[data-hero-lane]')).toHaveLength(1);
  expect(container.querySelector('[data-lane-caption]')).toBeNull();
  const named = [...container.querySelectorAll('[data-lane-track] a')]
    .filter((l) => l.getAttribute('aria-hidden') !== 'true')
    .map((l) => l.getAttribute('href'));
  // A premium app already among the removed ones is not repeated.
  expect(named).toEqual(['/?app=a', '/?app=p', '/?app=b', '/?app=c']);
});

// Owner 2026-11-24, «как Dock в macOS»: the lane is scrolled by a finger and never ends.
it('holds three equal copies of the lane, so it can be scrolled without an end', () => {
  const { container } = render(
    <HeroLanes removed={[app('a', '/a.png')]} premium={[app('p', '/p.png')]} />,
  );
  const links = container.querySelectorAll('[data-lane-track] a');
  expect(links.length % 3).toBe(0);
  expect(links.length).toBeGreaterThanOrEqual(36);
});

it('opens the install sheet of an app at once, naming each app once for a screen reader', () => {
  const { container } = render(
    <HeroLanes removed={[app('a', '/a.png'), app('b', '/b.png')]} premium={[]} />,
  );
  const links = [...container.querySelectorAll('[data-lane-track] a')];
  const named = links.filter((l) => l.getAttribute('aria-hidden') !== 'true');
  expect(named.map((l) => l.getAttribute('href'))).toEqual(['/?app=a', '/?app=b']);
  expect(named.map((l) => l.querySelector('img')?.getAttribute('alt'))).toEqual(['App a', 'App b']);
  for (const l of links.filter((x) => x.getAttribute('aria-hidden') === 'true')) {
    expect(l.getAttribute('tabindex')).toBe('-1');
  }
  // The lane only drifts slowly, so a touch opens the app right away.
  const link = named[0] as HTMLElement;
  fireEvent.pointerDown(link, { pointerType: 'touch' });
  expect(fireEvent.click(link)).toBe(true);
});

it('does not open an app at the end of a drag with the mouse', () => {
  const { container } = render(<HeroLanes removed={[app('a', '/a.png')]} premium={[]} />);
  const link = container.querySelector('[data-lane-track] a') as HTMLElement;
  fireEvent.pointerDown(link, { pointerType: 'mouse', clientX: 100 });
  fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 40 });
  fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 40 });
  expect(fireEvent.click(link)).toBe(false); // default prevented
});

it('names the app in the middle of the lane under it, for the eye only', () => {
  const { container } = render(<HeroLanes removed={[app('a', '/a.png')]} premium={[]} />);
  const name = container.querySelector('[data-lane-name]');
  expect(name).toHaveAttribute('aria-hidden', 'true');
});

// Owner 2026-11-24 21:39: the names that change under the drifting lane feel abrupt; they stay
// hidden until somebody searches.
it('shows the name only while somebody searches', () => {
  const removed = [app('a', '/a.png'), app('b', '/b.png')];
  const { container, rerender } = render(<HeroLanes removed={removed} premium={[]} />);
  const name = () => container.querySelector('[data-lane-name]');
  expect(name()).not.toHaveAttribute('data-show');
  rerender(<HeroLanes removed={removed} premium={[]} found={['a']} focus="a" />);
  expect(name()).toHaveAttribute('data-show');
  rerender(<HeroLanes removed={removed} premium={[]} found={[]} />);
  expect(name()).toHaveAttribute('data-show');
  rerender(<HeroLanes removed={removed} premium={[]} />);
  expect(name()).not.toHaveAttribute('data-show');
});

// The search moves the app it found to the middle; the apps found stay bright and the others
// fade (owner 2026-11-24: «так было прикольно», no blue ring).
it('keeps the apps the search found bright and dims the others', () => {
  const removed = [app('a', '/a.png'), app('b', '/b.png')];
  const { container, rerender } = render(<HeroLanes removed={removed} premium={[]} />);
  expect(container.querySelectorAll('[data-hit], [data-dim]')).toHaveLength(0);
  act(() => rerender(<HeroLanes removed={removed} premium={[]} focus="b" found={['b']} />));
  const hits = [...container.querySelectorAll('[data-hit]')];
  const dims = [...container.querySelectorAll('[data-dim]')];
  expect(hits.length).toBeGreaterThan(0);
  for (const h of hits) expect(h.getAttribute('href')).toBe('/?app=b');
  expect(dims.length).toBeGreaterThan(0);
  for (const d of dims) expect(d.getAttribute('href')).toBe('/?app=a');
});

it('draws the lane from one section while the other has no apps', () => {
  const { container } = render(<HeroLanes removed={[]} premium={[app('p', '/p.png')]} />);
  expect(container.querySelectorAll('[data-hero-lane]')).toHaveLength(1);
  expect(container.querySelector('[data-lane-placeholder]')).toBeNull();
});

// Owner 2026-11-24 16:55: while the catalog is empty, placeholders stand in for the icons.
it('without apps draws placeholder icons that lead nowhere', () => {
  const { container } = render(<HeroLanes removed={[]} premium={[app('x')]} />);
  expect(container.querySelector('[data-hero-lane]')).toBeNull();
  const ghost = container.querySelector('[data-lane-placeholder]');
  expect(ghost).toHaveAttribute('aria-hidden', 'true');
  expect(ghost?.querySelectorAll('[data-ghost]').length).toBeGreaterThanOrEqual(12);
  expect(ghost?.querySelector('a, img')).toBeNull();
});

// Spec 2026-11-23-home-first-screen, «Лента как Dock» (owner 2026-11-24, ×1.38).
it('makes the middle icon 1.38 times larger and the others smaller towards the edges', () => {
  // Five icons 60 px apart, the second one right in the middle.
  const scales = dockScales([-60, 0, 60, 120, 400], 60);
  expect(scales[1]).toBeCloseTo(1.38, 5);
  expect(scales[0]).toBeCloseTo(scales[2] as number, 5);
  expect(scales[2]).toBeLessThan(1.38);
  expect(scales[3]).toBeLessThan(scales[2] as number);
  expect(scales[4]).toBe(1);
});

it('finds an app of the lane by its name or address, in any case, with common spellings', () => {
  const apps = [
    app('telegram', '/t.png', 'Telegram'),
    app('2gis', '/g.png', '2ГИС'),
    app('yandex-mail', '/y.png', 'Яндекс Почта'),
    app('vkontakte', '/v.png', 'ВКонтакте'),
    app('app-1', '/1.png', 'Тестовое приложение 1'),
    app('app-10', '/10.png', 'Тестовое приложение 10'),
  ];
  expect(matchApp(apps, 'tele')).toBe('telegram');
  expect(matchApp(apps, 'Телеграм')).toBe('telegram');
  expect(matchApp(apps, '2гис')).toBe('2gis');
  expect(matchApp(apps, 'почта')).toBe('yandex-mail');
  expect(matchApp(apps, 'вк')).toBe('vkontakte');
  expect(matchApp(apps, 'Тестовое приложение 1')).toBe('app-1');
  expect(matchApp(apps, 'Тестовое приложение 10')).toBe('app-10');
  expect(matchApp(apps, 'тикток')).toBeNull();
  expect(matchApp(apps, '  ')).toBeNull();
  // Every app of the lane that fits, the best one first.
  expect(matchApps(apps, 'тестовое приложение 1')).toEqual(['app-1', 'app-10']);
  expect(matchApps(apps, 'тикток')).toEqual([]);
});

// Owner 2026-11-24 21:53: «дёргание в момент, когда иконка становится большой». The neighbours were
// pushed out from the nearest icon, so when the next icon became the nearest, the whole lane jumped
// by about 19 px. Now the point in the middle of the lane stays put and nothing jumps.
it('moves the icons smoothly when the next icon becomes the middle one', () => {
  const sw = 66;
  const at = (pos: number) => {
    const d = Array.from({ length: 9 }, (_, k) => k * sw + sw / 2 - pos);
    const sc = dockScales(d, sw);
    const shift = dockShifts(d, sc, sw * 0.82);
    return d.map((v, k) => v + (shift[k] as number));
  };
  // The middle of the lane crosses the border between icons 4 and 5.
  const before = at(5 * sw - 0.01);
  const after = at(5 * sw + 0.01);
  for (let k = 0; k < 9; k++) {
    expect(Math.abs((after[k] as number) - (before[k] as number))).toBeLessThan(0.1);
  }
  // Still a Dock: the icons right and left of the middle move apart.
  const still = at(4 * sw + sw / 2);
  expect((still[5] as number) - (still[4] as number)).toBeGreaterThan(sw);
});
