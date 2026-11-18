import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SectionTiles } from './SectionTiles';
import { SECTIONS, sectionBySlug } from './sections';

describe('catalog sections', () => {
  it('are the four sections the owner asked for, in order', () => {
    expect(SECTIONS.map((s) => [s.title, s.href])).toEqual([
      ['Удалённые из App Store', '/removed'],
      ['Premium доступы', '/premium'],
      ['Популярные', '/popular'],
      ['Весь каталог', '/catalog'],
    ]);
    expect(sectionBySlug('popular')?.title).toBe('Популярные');
    expect(sectionBySlug('nope')).toBeUndefined();
  });

  it('home tiles link to every section', () => {
    render(<SectionTiles />);
    const nav = screen.getByRole('navigation', { name: 'Разделы каталога' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/removed',
      '/premium',
      '/popular',
      '/catalog',
    ]);
    expect(links[0]).toHaveAccessibleName(/Удалённые из App Store/);
  });
});
