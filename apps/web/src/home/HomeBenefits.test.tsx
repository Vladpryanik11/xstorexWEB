import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { HomeBenefits } from './HomeBenefits';

it('lists four short benefits', () => {
  render(<HomeBenefits />);
  const region = screen.getByRole('region', { name: 'Преимущества Xstorex' });
  const items = within(region).getAllByRole('listitem');
  expect(
    items.map((li) => [
      within(li).getByRole('heading', { level: 3 }).textContent,
      li.querySelector('p')?.textContent,
    ]),
  ).toEqual([
    ['Нет в App Store', 'Банки, сервисы, игры'],
    ['Premium включён', 'Все функции открыты'],
    ['Безопасно', 'Установка из Safari'],
    ['Пара нажатий', 'Без компьютера'],
  ]);
});
