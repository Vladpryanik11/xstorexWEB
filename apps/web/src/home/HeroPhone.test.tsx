import { render, screen } from '@testing-library/react';
import type { AppCard, CollectionView } from '@xstore/shared';
import { expect, it } from 'vitest';
import { HeroPhone } from './HeroPhone';

const app = (n: number, iconUrl?: string) =>
  ({ slug: `a${n}`, name: `Приложение ${n}`, iconUrl }) as unknown as AppCard;

const col = (title: string, count: number): CollectionView => ({
  slug: title,
  title,
  layout: 'icons',
  items: Array.from({ length: count }, (_, i) => app(i + 1, i === 0 ? '/i.png' : undefined)),
});

it('draws up to three shelves of up to four real catalog icons', () => {
  const { container } = render(
    <HeroPhone
      collections={[
        col('Банки', 6),
        col('Пусто', 0),
        col('Игры', 2),
        col('Сервисы', 4),
        col('Новое', 4),
        col('Лишняя', 4),
      ]}
    />,
  );
  const shelves = [...container.querySelectorAll('[data-shelf]')];
  expect(shelves.map((s) => s.getAttribute('data-shelf'))).toEqual(['Банки', 'Игры', 'Сервисы']);
  expect(shelves[0]?.querySelectorAll('[data-app]')).toHaveLength(4);
  expect(shelves[1]?.querySelectorAll('[data-app]')).toHaveLength(2);
  expect(shelves[0]?.querySelector('img')).toHaveAttribute('src', '/i.png');
  expect(screen.getAllByText('Приложение 1').length).toBeGreaterThan(0);
});

it('shows the store chrome: search, chips and the Premium banner', () => {
  render(<HeroPhone collections={[]} />);
  expect(screen.getByText('Поиск приложений…')).toBeInTheDocument();
  for (const chip of ['Все', 'Банки', 'Игры', 'Сервисы']) {
    expect(screen.getAllByText(chip).length).toBeGreaterThan(0);
  }
  expect(screen.getByText('Premium‑доступы к приложениям')).toBeInTheDocument();
});
