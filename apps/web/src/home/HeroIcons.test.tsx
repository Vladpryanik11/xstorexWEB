import { render } from '@testing-library/react';
import type { CollectionView } from '@xstore/shared';
import { expect, it } from 'vitest';
import { HeroIcons, heroIcons } from './HeroIcons';

const app = (slug: string, iconUrl: string | null) =>
  ({ slug, name: slug, iconUrl }) as CollectionView['items'][number];

const collections = [
  { slug: 'a', title: 'A', layout: 'grid3', items: [app('one', '/i/1.png'), app('two', null)] },
  {
    slug: 'b',
    title: 'B',
    layout: 'grid3',
    items: [app('one', '/i/1.png'), app('three', '/i/3.png'), app('four', '/i/4.png')],
  },
] as CollectionView[];

it('takes unique app icons from the home collections, skipping apps without one', () => {
  expect(heroIcons(collections, 6)).toEqual(['/i/1.png', '/i/3.png', '/i/4.png']);
  expect(heroIcons(collections, 2)).toEqual(['/i/1.png', '/i/3.png']);
});

it('draws a plain row of five icons, no ring or captions, hidden from screen readers', () => {
  const { container } = render(<HeroIcons collections={collections} />);
  const row = container.querySelector('[data-hero-icons]');
  expect(row?.getAttribute('aria-hidden')).toBe('true');
  expect(row?.querySelectorAll('[data-icon]')).toHaveLength(5);
  expect(row?.querySelectorAll('img')).toHaveLength(3);
  expect(row?.textContent).toBe('');
});
