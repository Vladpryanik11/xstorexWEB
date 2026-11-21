import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { HomeFaq, HomeFinal, HomePlan, HomeStats, HomeWhy } from './HomeSell';

const price = (s: string) => s.replace(/\s/g, ' ');

it('plan card: price, what is included and a button with the price', () => {
  render(<HomePlan priceRub={590} />);
  const card = screen.getByRole('region', { name: 'Весь каталог на 1 месяц' });
  expect(price(card.querySelector('p')?.textContent ?? '')).toBe('590 ₽ в месяц');
  const items = within(card)
    .getAllByRole('listitem')
    .map((li) => li.textContent);
  expect(items).toHaveLength(3);
  expect(items[2]).toContain('Гарантия до последнего дня');
  const cta = within(card).getByRole('link', { name: /Получить доступ за\s590\s₽/ });
  expect(cta).toHaveAttribute('href', '/get');
  expect(cta).toHaveAttribute('data-page-cta');
  // Proof right under the pay button (owner 2026-11-21).
  expect(cta.nextElementSibling).toHaveTextContent(/10 000\+\s*пользователей в месяц/);
});

it('stats row: three figures the owner confirmed', () => {
  render(<HomeStats />);
  const list = screen.getByRole('list', { name: 'Xstorex в цифрах' });
  expect(
    within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent?.replace(/\s+/g, ' ')),
  ).toEqual(['200+ приложений', '10 000+ пользователей в месяц', '0 ₽ доплат по гарантии']);
});

it('plan card without a price still sells, with a plain button', () => {
  render(<HomePlan priceRub={null} />);
  expect(screen.queryByText(/₽/)).toBeNull();
  expect(screen.getByRole('link', { name: 'Подключить iPhone' })).toHaveAttribute('href', '/get');
});

it('why Xstorex: four reasons', () => {
  render(<HomeWhy />);
  const sec = screen.getByRole('region', { name: 'Почему Xstorex' });
  expect(
    within(sec)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent),
  ).toEqual([
    'То, что удалили из App Store',
    'Без лишних программ и аккаунтов',
    'Только честные копии',
    'Живые люди в поддержке',
  ]);
});

it('FAQ answers only what is promised in the spec', () => {
  render(<HomeFaq />);
  const sec = screen.getByRole('region', { name: 'Частые вопросы' });
  const qs = [...sec.querySelectorAll('summary')].map((s) => s.textContent);
  expect(qs).toEqual([
    'Это не взлом? С iPhone ничего не случится?',
    'А если приложение перестанет открываться?',
    'Нужна ли регистрация?',
    'Мне нужен компьютер?',
  ]);
  expect(sec.textContent).not.toMatch(/вернём деньги|спишутся/);
});

it('final call: price in the button when known, guarantee in the line', () => {
  render(<HomeFinal priceRub={590} />);
  const sec = screen.getByRole('region', { name: 'Ваши приложения уже ждут' });
  expect(sec).toHaveTextContent(/Гарантия на весь срок подписки/);
  expect(within(sec).getByRole('link', { name: /Получить доступ за\s590\s₽/ })).toHaveAttribute(
    'data-page-cta',
  );
});
