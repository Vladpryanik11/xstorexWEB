import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { HomeFaq, HomePlan } from './HomeSell';

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

it('plan card without a price still sells, with a plain button', () => {
  render(<HomePlan priceRub={null} />);
  expect(screen.queryByText(/₽/)).toBeNull();
  expect(screen.getByRole('link', { name: 'Подключить iPhone' })).toHaveAttribute('href', '/get');
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
