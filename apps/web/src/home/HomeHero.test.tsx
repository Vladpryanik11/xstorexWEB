import { render, screen, within } from '@testing-library/react';
import type { CollectionView } from '@xstore/shared';
import { expect, it } from 'vitest';
import { HomeHero } from './HomeHero';

const collections: CollectionView[] = [];

it('sells the subscription: headline, three benefits, one button and the audience line', () => {
  render(<HomeHero collections={collections} />);

  expect(
    screen.getByRole('heading', {
      level: 1,
      name: /^200\+ приложений с\sPremium‑доступом на\sвашем\siPhone$/,
    }),
  ).toBeVisible();

  const list = screen.getByRole('list', { name: 'Что входит в подписку' });
  const items = within(list).getAllByRole('listitem');
  expect(items.map((li) => li.querySelector('b')?.textContent)).toEqual([
    'Удалённые из App Store',
    'Premium‑доступы',
    'Проверенные сертификаты',
  ]);
  expect(within(list).getByText('Безопасная установка прямо из Safari')).toBeVisible();

  expect(screen.getByRole('link', { name: 'Подключить iPhone' })).toHaveAttribute('href', '/get');
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByText('10 000+')).toBeVisible();
  expect(screen.getByText('пользователей в месяц')).toBeVisible();
});

it('keeps the phone picture away from screen readers', () => {
  const { container } = render(<HomeHero collections={collections} />);
  const phone = container.querySelector('[data-hero-phone]');
  expect(phone).not.toBeNull();
  expect(phone?.closest('[aria-hidden="true"]')).not.toBeNull();
});

it('on a phone leads with the guarantee and a two-line promise (variant A)', () => {
  const { container } = render(<HomeHero collections={collections} />);
  expect(screen.getByText('Гарантия на весь срок подписки')).toBeVisible();
  // Owner 2026-11-21: two short lines under the headline.
  expect(
    screen.getByText('Premium‑доступы к приложениям уже в подписке').parentElement,
  ).toHaveTextContent(/^Удалённые из App Store Premium‑доступы к приложениям уже в подписке$/);
  expect(container.querySelector('[data-hero-icons]')).not.toBeNull();
});

it('puts the button right above the audience line, under the icon showcase (owner 2026-11-21)', () => {
  const { container } = render(<HomeHero collections={collections} />);
  const cta = screen.getByRole('link', { name: /Подключить iPhone/ });
  const showcase = container.querySelector('[data-hero-icons]') as Element;
  expect(showcase.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(cta.nextElementSibling).toHaveTextContent(/10 000\+\s*пользователей в месяц/);
});
