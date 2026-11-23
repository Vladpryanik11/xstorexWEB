import { render, screen, within } from '@testing-library/react';
import type { AppCard, CollectionView } from '@xstore/shared';
import { expect, it } from 'vitest';
import { HomeHero } from './HomeHero';

const collections: CollectionView[] = [];
const lanes = {
  removed: [{ slug: 'r', name: 'r', iconUrl: '/r.png' }] as AppCard[],
  premium: [{ slug: 'p', name: 'p', iconUrl: '/p.png' }] as AppCard[],
};

const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

// Spec 2026-11-23-home-first-screen §3 (owner 2026-11-23).
it('first screen in the approved order: promise, lanes, search, button, three promises, audience', () => {
  const { container } = render(<HomeHero collections={collections} lanes={lanes} />);

  const h1 = screen.getByRole('heading', {
    level: 1,
    name: 'Удаленные из App\u00a0Store снова доступны',
  });
  const sub = screen.getByText(
    'Премиум подписки на музыку, фоторедакторы, платные игры — уже в подписке',
  );
  const lanesEl = container.querySelector('[data-hero-lanes]') as Element;
  expect(screen.getByText('Удалены из App Store')).toBeVisible();
  const search = screen.getByRole('search');
  expect(search).toHaveAttribute('action', '/search');
  expect(screen.getByPlaceholderText('Найти свое приложение')).toBeVisible();
  const cta = screen.getByRole('link', { name: 'Подключить iPhone' });
  expect(cta).toHaveAttribute('href', '/get');
  // Apple-like pill В+ (owner 2026-11-23): the label alone, no icon.
  expect(cta.querySelector('svg')).toBeNull();
  // Three promises under the button (owner 2026-11-23, variant А); the ticks and the guarantee line are gone.
  const promises = screen.getByRole('list', { name: 'Без лишнего' });
  expect(
    within(promises)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['Без входа в Apple ID', 'Без компьютера', 'Гарантия на весь срок']);
  // Plain shield, no check mark (owner 2026-11-23 17:40).
  expect(promises.querySelectorAll('svg')).toHaveLength(3);
  expect(screen.queryByText('Гарантия на весь срок подписки')).toBeNull();
  const audience = screen.getByText('10 000');
  expect(audience.closest('[data-hero-audience]')).toHaveTextContent(
    'Более 10 000 пользователей в месяц',
  );
  expect(container.querySelectorAll('[data-hero-audience] [data-avatar]')).toHaveLength(3);

  const order = [h1, sub, lanesEl, search, cta, promises, audience];
  for (let i = 1; i < order.length; i++) {
    expect(follows(order[i - 1] as Element, order[i] as Element)).toBe(true);
  }
  expect(screen.getAllByRole('link')).toHaveLength(1);
});

it('three steps and «Установка прямо с сайта» right under the first screen', () => {
  render(<HomeHero collections={collections} lanes={lanes} />);
  const steps = screen.getByRole('list', { name: 'Три шага' });
  expect(
    within(steps)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['1Подключи', '2Активируй', '3Скачивай']);
  const site = screen.getByText('Установка прямо с сайта');
  expect(follows(screen.getByText('10 000'), steps)).toBe(true);
  expect(follows(steps, site)).toBe(true);
});

it('keeps the sky and the computer picture away from screen readers', () => {
  const { container } = render(<HomeHero collections={collections} lanes={lanes} />);
  const sky = container.querySelector('[data-hero-sky]');
  expect(sky).toHaveAttribute('aria-hidden', 'true');
  const phone = container.querySelector('[data-hero-phone]');
  expect(phone?.closest('[aria-hidden="true"]')).not.toBeNull();
});
