import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { HowItWorks } from './HowItWorks';

it('shows three numbered steps and the rights line', () => {
  render(<HowItWorks />);
  const region = screen.getByRole('region', { name: 'Как это работает' });
  const steps = within(region).getAllByRole('listitem');
  expect(steps).toHaveLength(3);
  expect(steps.map((s) => within(s).getByRole('heading', { level: 3 }).textContent)).toEqual([
    'Оплатите подписку',
    'Подключите iPhone',
    'Устанавливайте приложения',
  ]);
  // Owner 2026-11-24 10:12: the same words as the «Как это работает?» window.
  expect(
    within(steps[0] as HTMLElement).getByText(
      'Нужна только почта, без регистрации. Доступ ко всему каталогу начинается сразу.',
    ),
  ).toBeVisible();
  expect(
    within(region).getByText(
      'Только приложения с правами на распространение. Никаких взломанных версий.',
    ),
  ).toBeInTheDocument();
});

it('is the «Как это работает» target of the header (/#how, owner 2026-11-23)', () => {
  render(<HowItWorks />);
  expect(screen.getByRole('region', { name: 'Как это работает' })).toHaveAttribute('id', 'how');
});
