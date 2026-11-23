import { fireEvent, render } from '@testing-library/react';
import type { AppCard } from '@xstore/shared';
import { expect, it } from 'vitest';
import { HeroLanes, laneApps } from './HeroLanes';

const app = (slug: string, iconUrl?: string) => ({ slug, name: `App ${slug}`, iconUrl }) as AppCard;

it('repeats the apps of a section until the lane is full, skipping apps without an icon', () => {
  expect(
    laneApps([app('a', '/a.png'), app('b'), app('c', '/c.png')], 5).map((a) => a.slug),
  ).toEqual(['a', 'c', 'a', 'c', 'a']);
  expect(laneApps([app('b')], 5)).toEqual([]);
});

// Spec 2026-11-23-home-first-screen §3.3 (owner 2026-11-23): two lanes, captions above them.
it('draws the removed lane over the premium lane, each under its caption', () => {
  const { container } = render(
    <HeroLanes removed={[app('a', '/a.png')]} premium={[app('p', '/p.png')]} />,
  );
  const lanes = [...container.querySelectorAll('[data-hero-lane]')];
  expect(lanes.map((l) => l.getAttribute('data-hero-lane'))).toEqual(['removed', 'premium']);
  expect(lanes.map((l) => l.querySelector('[data-lane-caption]')?.textContent)).toEqual([
    'Удалены из App Store',
    'Premium',
  ]);
});

// Owner 2026-11-23 18:16 (variant В): the lanes run endlessly, the top one faster.
it('runs each lane as two equal halves, the removed lane faster than the premium lane', () => {
  const { container } = render(
    <HeroLanes removed={[app('a', '/a.png')]} premium={[app('p', '/p.png')]} />,
  );
  const tracks = [...container.querySelectorAll<HTMLElement>('[data-lane-track]')];
  for (const track of tracks) {
    const links = track.querySelectorAll('a');
    expect(links.length % 2).toBe(0);
    expect(links.length).toBeGreaterThanOrEqual(24);
  }
  const seconds = tracks.map((t) => Number.parseFloat(t.style.getPropertyValue('--lane-duration')));
  expect(seconds[0]).toBeGreaterThan(0);
  expect(seconds[1]).toBeGreaterThan(seconds[0] as number);
});

it('opens the install sheet of an app, naming each app once for a screen reader', () => {
  const { container } = render(
    <HeroLanes removed={[app('a', '/a.png'), app('b', '/b.png')]} premium={[]} />,
  );
  const links = [...container.querySelectorAll('[data-lane-track] a')];
  expect(links[0]?.getAttribute('href')).toBe('/?app=a');
  expect(links[1]?.getAttribute('href')).toBe('/?app=b');
  const named = links.filter((l) => l.getAttribute('aria-hidden') !== 'true');
  expect(named.map((l) => l.querySelector('img')?.getAttribute('alt'))).toEqual(['App a', 'App b']);
  for (const l of links.filter((x) => x.getAttribute('aria-hidden') === 'true')) {
    expect(l.getAttribute('tabindex')).toBe('-1');
  }
});

// A moving icon is hard to hit: the first touch only stops the lane, the next one opens.
it('stops a running lane on the first touch and opens the app on the next', () => {
  const { container } = render(<HeroLanes removed={[app('a', '/a.png')]} premium={[]} />);
  const lane = container.querySelector('[data-hero-lane]') as HTMLElement;
  const link = container.querySelector('[data-lane-track] a') as HTMLElement;

  fireEvent.pointerDown(link, { pointerType: 'touch' });
  expect(lane).toHaveAttribute('data-paused');
  expect(fireEvent.click(link)).toBe(false); // default prevented

  fireEvent.pointerDown(link, { pointerType: 'touch' });
  expect(fireEvent.click(link)).toBe(true);
});

it('leaves out a section that has no apps yet', () => {
  const { container } = render(<HeroLanes removed={[app('a', '/a.png')]} premium={[]} />);
  expect(container.querySelectorAll('[data-hero-lane]')).toHaveLength(1);
  const { container: none } = render(<HeroLanes removed={[]} premium={[]} />);
  expect(none.querySelector('[data-hero-lanes]')).toBeNull();
});
