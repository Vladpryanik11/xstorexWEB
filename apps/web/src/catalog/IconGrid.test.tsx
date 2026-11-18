import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconGrid } from './IconGrid';

describe('IconGrid', () => {
  it('shows apps as icons with names that open the install sheet', () => {
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
    expect(within(list).queryByRole('link')).toBeNull();
    const buttons = within(list).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['ВКонтакте', 'Okko']);
    expect(within(list).queryByText('Чаты')).toBeNull();
    fireEvent.click(buttons[0] as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'ВКонтакте' })).toHaveTextContent('Чаты');
  });
});
