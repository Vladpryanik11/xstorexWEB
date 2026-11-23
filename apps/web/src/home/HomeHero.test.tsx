import { render, screen, within } from '@testing-library/react';
import type { CollectionView } from '@xstore/shared';
import { expect, it } from 'vitest';
import { HomeHero } from './HomeHero';

const collections: CollectionView[] = [];

const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

// Spec 2026-11-23-home-first-screen §3 (owner 2026-11-23).
it('first screen in the approved order: promise, ticks, banner, search, button, guarantee, audience', () => {
  const { container } = render(<HomeHero collections={collections} />);

  const h1 = screen.getByRole('heading', {
    level: 1,
    name: 'Удаленные из App Store снова доступны',
  });
  const sub = screen.getByText(
    'Премиум подписки на музыку, фоторедакторы, платные игры — уже в подписке',
  );
  const ticks = screen.getByRole('list', { name: 'Без лишнего' });
  expect(
    within(ticks)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['Без входа в Apple ID', 'Без компьютера']);
  const banner = container.querySelector('[data-hero-banner]') as Element;
  expect(banner.closest('[aria-hidden="true"]')).not.toBeNull();
  const search = screen.getByRole('search');
  expect(search).toHaveAttribute('action', '/search');
  expect(screen.getByPlaceholderText('Найти свое приложение')).toBeVisible();
  const cta = screen.getByRole('link', { name: 'Подключить iPhone' });
  expect(cta).toHaveAttribute('href', '/get');
  const guarantee = screen.getByText('Гарантия на весь срок подписки');
  const audience = screen.getByText('10 000+');
  expect(screen.getByText('пользователей в месяц')).toBeVisible();

  const order = [h1, sub, ticks, banner, search, cta, guarantee, audience];
  for (let i = 1; i < order.length; i++) {
    expect(follows(order[i - 1] as Element, order[i] as Element)).toBe(true);
  }
  expect(screen.getAllByRole('link')).toHaveLength(1);
});

it('three steps and «Установка прямо с сайта» right under the first screen', () => {
  render(<HomeHero collections={collections} />);
  const steps = screen.getByRole('list', { name: 'Три шага' });
  expect(
    within(steps)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['1Подключи', '2Активируй', '3Скачивай']);
  const site = screen.getByText('Установка прямо с сайта');
  expect(follows(screen.getByText('10 000+'), steps)).toBe(true);
  expect(follows(steps, site)).toBe(true);
});

it('keeps the sky and the computer picture away from screen readers', () => {
  const { container } = render(<HomeHero collections={collections} />);
  const sky = container.querySelector('[data-hero-sky]');
  expect(sky).toHaveAttribute('aria-hidden', 'true');
  const phone = container.querySelector('[data-hero-phone]');
  expect(phone?.closest('[aria-hidden="true"]')).not.toBeNull();
});
