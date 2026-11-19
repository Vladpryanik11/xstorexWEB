import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../../src/api/server', () => ({
  serverApi: async () => ({
    getPlan: async () => ({ code: 'month', title: 'Месяц', durationDays: 30, priceRub: 299 }),
  }),
}));

it('one plan for one iPhone, leading to the wizard', async () => {
  const { default: Page } = await import('./page');
  render(await Page());
  expect(screen.getByText('Для одного iPhone')).toBeInTheDocument();
  expect(screen.queryByText(/iPad/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Оформить доступ' })).toHaveAttribute('href', '/get');
});
