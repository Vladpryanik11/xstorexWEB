import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconGrid } from './IconGrid';

describe('IconGrid', () => {
  it('shows apps as icons with names, linking to their pages', () => {
    render(
      <IconGrid
        label="Популярные"
        apps={[
          { slug: 'vk', name: 'ВКонтакте', subtitle: 'Чаты', iconUrl: '/vk.png' },
          { slug: 'okko', name: 'Okko' },
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Популярные' });
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['ВКонтакте', '/app/vk'],
      ['Okko', '/app/okko'],
    ]);
    expect(within(list).queryByText('Чаты')).toBeNull();
  });
});
