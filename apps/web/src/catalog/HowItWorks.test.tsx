import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { HowItWorks } from './HowItWorks';

it('shows three numbered steps and the rights line', () => {
  render(<HowItWorks />);
  const region = screen.getByRole('region', { name: 'Как это работает' });
  const steps = within(region).getAllByRole('listitem');
  expect(steps).toHaveLength(3);
  expect(steps.map((s) => within(s).getByRole('heading', { level: 3 }).textContent)).toEqual([
    'Найдите приложение',
    'Оплатите',
    'Установите',
  ]);
  expect(
    within(steps[1] as HTMLElement).getByText('Без регистрации, сразу на сайте.'),
  ).toBeVisible();
  expect(
    within(region).getByText(
      'Только приложения с правами на распространение. Никаких взломанных версий.',
    ),
  ).toBeInTheDocument();
});
