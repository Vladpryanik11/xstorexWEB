import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CategoryChips } from './CategoryChips';

const categories = [
  { slug: 'igry', name: 'Игры', icon: 'games' },
  { slug: 'foto', name: 'Фото', icon: 'photo' },
] as Parameters<typeof CategoryChips>[0]['categories'];

describe('CategoryChips', () => {
  it('has one highlight: on the active chip, following the hovered one', () => {
    const { container } = render(<CategoryChips categories={categories} active="igry" />);
    const highlights = () => container.querySelectorAll('[data-chip-highlight]');
    const games = screen.getByRole('link', { name: 'Игры' });
    const photo = screen.getByRole('link', { name: 'Фото' });
    expect(highlights()).toHaveLength(1);
    expect(games).toContainElement(highlights()[0] as HTMLElement);
    fireEvent.mouseEnter(photo);
    expect(highlights()).toHaveLength(1);
    expect(photo).toContainElement(highlights()[0] as HTMLElement);
    fireEvent.mouseLeave(screen.getByRole('list'));
    expect(games).toContainElement(highlights()[0] as HTMLElement);
  });

  it('has no highlight when no chip is active or hovered', () => {
    const { container } = render(<CategoryChips categories={categories} />);
    expect(container.querySelectorAll('[data-chip-highlight]')).toHaveLength(0);
  });

  it('filters a section: chips link to ?c= and «Все» resets', () => {
    render(
      <CategoryChips
        categories={categories}
        active="foto"
        filterBase="/premium"
        all={{ href: '/premium', label: 'Все' }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Фото' })).toHaveAttribute('href', '/premium?c=foto');
    expect(screen.getByRole('link', { name: 'Все' })).toHaveAttribute('href', '/premium');
  });
});
