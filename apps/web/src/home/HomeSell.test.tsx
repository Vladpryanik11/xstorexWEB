import { render, screen, within } from '@testing-library/react';
import type { AppCard } from '@xstore/shared';
import { expect, it } from 'vitest';
import { HomeFaq, HomePlan } from './HomeSell';

const app = (slug: string, iconUrl: string | null = `/i/${slug}.png`) =>
  ({ slug, name: slug, iconUrl }) as AppCard;

const price = (s: string) => s.replace(/\s/g, ' ');

it('plan card: what is included and the price on the button, said once', () => {
  render(<HomePlan priceRub={590} apps={[]} />);
  const card = screen.getByRole('region', { name: 'Весь каталог в одной подписке' });
  const items = within(card)
    .getAllByRole('listitem')
    .map((li) => li.textContent);
  // Owner 2026-11-24 13:12, variant Г: three short points as pills in a row, no ticks.
  expect(items).toEqual(['Безлимит', '1 iPhone', 'Гарантия']);
  expect(card.querySelector('li svg')).toBeNull();
  // Owner 2026-11-24 13:57, variant Б: the price only on the white button, said once.
  const cta = within(card).getByRole('link');
  expect(price(cta.textContent ?? '')).toBe('590 ₽ / мес.');
  expect(cta).toHaveAttribute('href', '/get');
  expect(cta).toHaveAttribute('data-page-cta');
  expect(card.textContent?.match(/590/g)).toHaveLength(1);
  expect(card.textContent?.match(/₽/g)).toHaveLength(1);
  expect(card.textContent?.match(/мес/g)).toHaveLength(1);
  expect(card.textContent).not.toMatch(/10 000|в день/);
});

it('plan card without a price still sells, with a plain button', () => {
  render(<HomePlan priceRub={null} apps={[]} />);
  expect(screen.queryByText(/₽/)).toBeNull();
  expect(screen.getByRole('link', { name: 'Подключить iPhone' })).toHaveAttribute('href', '/get');
});

// Owner 2026-11-24 14:04, variant Г: the title says it is one subscription, a row of real catalog
// icons shows what is in it; without icons there is no row.
it('plan card shows five catalog icons and the size of the catalog above the price', () => {
  const apps = ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => app(s));
  render(<HomePlan priceRub={590} apps={[app('x', null), app('a'), ...apps]} />);
  const card = screen.getByRole('region', { name: 'Весь каталог в одной подписке' });
  const row = within(card).getByRole('list', { name: 'Приложения каталога' });
  const icons = [...row.querySelectorAll('img')];
  expect(icons.map((i) => i.getAttribute('src'))).toEqual(
    ['a', 'b', 'c', 'd', 'e'].map((s) => `/i/${s}.png`),
  );
  for (const i of icons) expect(i).toHaveAttribute('alt', '');
  expect(row.textContent).toBe('+200');
  expect(card.textContent?.match(/590/g)).toHaveLength(1);
});

it('plan card without catalog icons has no icon row', () => {
  render(<HomePlan priceRub={590} apps={[app('x', null)]} />);
  expect(screen.queryByRole('list', { name: 'Приложения каталога' })).toBeNull();
  expect(screen.queryByText('+200')).toBeNull();
});

// Owner 2026-11-24 12:20–12:29 (home variant Б): the first question says why it is safe; the
// reasons of the removed «Почему Xstorex» became questions.
it('FAQ starts with safety and answers only what is promised in the spec', () => {
  render(<HomeFaq />);
  const sec = screen.getByRole('region', { name: 'Частые вопросы' });
  const qs = [...sec.querySelectorAll('summary')].map((s) => s.textContent);
  expect(qs).toEqual([
    'Это безопасно?',
    'А если приложение перестанет открываться?',
    'Нужна ли регистрация?',
    'Мне нужен компьютер?',
    'Что если приложение удалили из App Store?',
    'Сколько ждать после подключения iPhone?',
    'Как связаться с поддержкой?',
  ]);
  const first = sec.querySelector('details p')?.textContent ?? '';
  expect(first).toContain(
    'Доступа к iPhone у нас нет: фото, сообщения, пароли и Apple ID мы не видим.',
  );
  expect(first).toContain('без сторонних программ и взломанных версий');
  expect(sec.textContent).not.toMatch(/сотрудникам/);
  expect(sec.textContent).not.toMatch(/вернём деньги|спишутся/);
});
