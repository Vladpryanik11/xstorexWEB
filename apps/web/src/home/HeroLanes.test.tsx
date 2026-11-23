import { render } from '@testing-library/react';
import type { AppCard } from '@xstore/shared';
import { expect, it } from 'vitest';
import { HeroLanes, laneIcons } from './HeroLanes';

const app = (slug: string, iconUrl?: string) => ({ slug, name: slug, iconUrl }) as AppCard;

it('repeats the real icons of a section until the lane is full, skipping apps without one', () => {
  expect(laneIcons([app('a', '/a.png'), app('b'), app('c', '/c.png')], 5)).toEqual([
    '/a.png',
    '/c.png',
    '/a.png',
    '/c.png',
    '/a.png',
  ]);
  expect(laneIcons([app('b')], 5)).toEqual([]);
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
  for (const lane of lanes) {
    const track = lane.querySelector('[data-lane-track]');
    expect(track?.getAttribute('aria-hidden')).toBe('true');
    expect(track?.querySelectorAll('img').length).toBeGreaterThanOrEqual(12);
    expect(track?.querySelector('img')?.getAttribute('alt')).toBe('');
  }
});

it('leaves out a section that has no apps yet', () => {
  const { container } = render(<HeroLanes removed={[app('a', '/a.png')]} premium={[]} />);
  expect(container.querySelectorAll('[data-hero-lane]')).toHaveLength(1);
  const { container: none } = render(<HeroLanes removed={[]} premium={[]} />);
  expect(none.querySelector('[data-hero-lanes]')).toBeNull();
});
