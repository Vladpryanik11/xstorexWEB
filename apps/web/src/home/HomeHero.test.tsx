import { render, screen, within } from '@testing-library/react';
import type { AppCard } from '@xstore/shared';
import { expect, it } from 'vitest';
import { HomeHero } from './HomeHero';

const lanes = {
  removed: [{ slug: 'r', name: 'r', iconUrl: '/r.png' }] as AppCard[],
  premium: [{ slug: 'p', name: 'p', iconUrl: '/p.png' }] as AppCard[],
};

const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

// Spec 2026-11-23-home-first-screen §3 (owner 2026-11-23).
it('first screen in the approved order: promise, lanes, search, button, three promises, audience', () => {
  const { container } = render(<HomeHero lanes={lanes} />);

  const h1 = screen.getByRole('heading', {
    level: 1,
    name: 'Удаленные из App\u00a0Store снова доступны',
  });
  // Owner 2026-11-24: the same words in three lines, without the dash.
  const sub = container.querySelector('[data-hero-sub]') as HTMLElement;
  expect(sub.innerHTML.split('<br>')).toEqual([
    'Премиум подписки на музыку,',
    'фоторедакторы, платные игры',
    'уже в подписке',
  ]);
  const lanesEl = container.querySelector('[data-hero-lanes]') as Element;
  expect(lanesEl.querySelectorAll('[data-hero-lane]')).toHaveLength(1);
  expect(lanesEl.querySelector('[data-lane-caption]')).toBeNull();
  const search = screen.getByRole('search');
  expect(search).toHaveAttribute('action', '/search');
  // Owner 2026-11-24 (А3): a grey line right under the search.
  const count = container.querySelector('[data-hero-count]') as HTMLElement;
  expect(count).toHaveTextContent('200+ приложений');
  expect(follows(search, count)).toBe(true);
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
  // Owner 2026-11-24 09:28: three photos of people, each head whole inside its circle.
  const avatars = [...container.querySelectorAll('[data-hero-audience] [data-avatar]')];
  expect(avatars.map((a) => a.tagName)).toEqual(['IMG', 'IMG', 'IMG']);
  expect(avatars.map((a) => a.getAttribute('src'))).toEqual([
    '/home/avatars/1.webp',
    '/home/avatars/2.webp',
    '/home/avatars/3.webp',
  ]);
  expect(container.querySelector('[data-hero-audience] [data-avatar]')?.textContent).toBe('');

  const order = [h1, sub, lanesEl, search, cta, promises, audience];
  for (let i = 1; i < order.length; i++) {
    expect(follows(order[i - 1] as Element, order[i] as Element)).toBe(true);
  }
  // Owner 2026-11-24 09:11: a small blue «Как это работает?» right under the button.
  // It opens a window of steps over the page (09:12), so it is a button, not a link.
  const how = screen.getByRole('button', { name: 'Как это работает?' });
  expect(follows(cta, how) && follows(how, promises)).toBe(true);
  // Apart from the app icons of the lanes, the only link is the button.
  expect(screen.getAllByRole('link').filter((l) => !l.closest('[data-hero-lanes]'))).toHaveLength(
    1,
  );
});

// Owner 2026-11-24: the three steps leave the first screen (the «Как это работает» section stays).
it('ends the first screen with the audience line, without the three steps', () => {
  render(<HomeHero lanes={lanes} />);
  expect(screen.queryByRole('list', { name: 'Три шага' })).toBeNull();
  expect(screen.queryByText('Подключи')).toBeNull();
  expect(screen.queryByText('Установка прямо с сайта')).toBeNull();
});

it('keeps the sky away from screen readers', () => {
  const { container } = render(<HomeHero lanes={lanes} />);
  const sky = container.querySelector('[data-hero-sky]');
  expect(sky).toHaveAttribute('aria-hidden', 'true');
});

// Owner 2026-11-25 (ПК, вариант А «По центру»): no iPhone picture beside the text on a computer.
it('draws no iPhone picture beside the text', () => {
  const { container } = render(<HomeHero lanes={lanes} />);
  expect(container.querySelector('[data-hero-phone]')).toBeNull();
});
