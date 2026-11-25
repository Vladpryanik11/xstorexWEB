import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../../src/api/server', () => ({
  serverApi: async () => ({
    getPlan: async () => ({ code: 'month', title: 'Месяц', durationDays: 30, priceRub: 299 }),
    section: async (slug: string) => ({
      items: [{ slug: `${slug}-a`, name: 'A', iconUrl: `/${slug}.png` }],
    }),
  }),
}));

// Owner 2026-11-25 (ПК, пункт 8): «Тарифы» shows the plan card and the questions of the home page.
it('shows the plan card of the home page, leading to the wizard', async () => {
  const { default: Page } = await import('./page');
  render(await Page());
  expect(screen.getByRole('heading', { level: 1, name: 'Тарифы' })).toBeInTheDocument();
  const plan = screen.getByRole('region', { name: 'Весь каталог в одной подписке' });
  expect(within(plan).getByRole('list', { name: 'Что входит' })).toHaveTextContent('1 iPhone');
  expect(within(plan).getByRole('link', { name: /299/ })).toHaveAttribute('href', '/get');
  expect(screen.queryByText(/iPad/)).not.toBeInTheDocument();
});

it('asks the plan questions in the style of the home page', async () => {
  const { default: Page } = await import('./page');
  render(await Page());
  const faq = screen.getByRole('region', { name: 'Частые вопросы' });
  expect(within(faq).getAllByRole('group')).toHaveLength(3);
  expect(faq).toHaveTextContent('Можно ли оплатить с компьютера?');
});
