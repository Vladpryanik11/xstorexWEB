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

// Owner 2026-11-24: one lane without a caption, removed and premium apps taking turns.
it('draws one lane of removed and premium apps in turn, without a caption', () => {
  const { container } = render(
    <HeroLanes
      removed={[app('a', '/a.png'), app('b', '/b.png'), app('c', '/c.png')]}
      premium={[app('p', '/p.png'), app('a', '/a.png')]}
    />,
  );
  const lanes = container.querySelectorAll('[data-hero-lane]');
  expect(lanes).toHaveLength(1);
  expect(container.querySelector('[data-lane-caption]')).toBeNull();
  const named = [...container.querySelectorAll('[data-lane-track] a')]
    .filter((l) => l.getAttribute('aria-hidden') !== 'true')
    .map((l) => l.getAttribute('href'));
  // A premium app already among the removed ones is not repeated.
  expect(named).toEqual(['/?app=a', '/?app=p', '/?app=b', '/?app=c']);
});

it('runs the lane as two equal halves', () => {
  const { container } = render(
    <HeroLanes removed={[app('a', '/a.png')]} premium={[app('p', '/p.png')]} />,
  );
  const track = container.querySelector<HTMLElement>('[data-lane-track]') as HTMLElement;
  const links = track.querySelectorAll('a');
  expect(links.length % 2).toBe(0);
  expect(links.length).toBeGreaterThanOrEqual(24);
  expect(Number.parseFloat(track.style.getPropertyValue('--lane-duration'))).toBeGreaterThan(0);
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

it('draws the lane from one section while the other has no apps, and nothing without apps', () => {
  const { container } = render(<HeroLanes removed={[]} premium={[app('p', '/p.png')]} />);
  expect(container.querySelectorAll('[data-hero-lane]')).toHaveLength(1);
  const { container: none } = render(<HeroLanes removed={[]} premium={[]} />);
  expect(none.querySelector('[data-hero-lanes]')).toBeNull();
});
