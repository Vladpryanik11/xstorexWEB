import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { HowSheet } from './HowSheet';

// Owner 2026-11-24 09:12: «Как это работает?» under the button opens a window with steps that
// are swiped through, so nobody leaves the first screen.
it('opens a window of steps over the page instead of leaving it', () => {
  render(<HowSheet />);
  expect(screen.queryByRole('dialog')).toBeNull();
  const open = screen.getByRole('button', { name: 'Как это работает?' });
  fireEvent.click(open);
  const dialog = screen.getByRole('dialog', { name: 'Как это работает' });
  const slides = within(dialog).getAllByRole('group');
  expect(slides.map((s) => s.getAttribute('aria-label'))).toEqual([
    'Шаг 1 из 3',
    'Шаг 2 из 3',
    'Шаг 3 из 3',
  ]);
  expect(slides[0]).toHaveTextContent('Оплатите подписку');
  expect(slides[1]).toHaveTextContent('Подключите iPhone');
  expect(slides[2]).toHaveTextContent('Устанавливайте приложения');
});

// Owner 2026-11-24 10:12, variant А: each step shows a small iPhone screen of what the person will
// see there; the second step says honestly that the iPhone takes up to a day to get ready.
it('shows a small screen of each step and the honest lines', () => {
  render(<HowSheet />);
  fireEvent.click(screen.getByRole('button', { name: 'Как это работает?' }));
  const dialog = screen.getByRole('dialog');
  const slides = within(dialog).getAllByRole('group');
  for (const s of slides) {
    const shot = s.querySelector('[data-how-screen]');
    expect(shot).not.toBeNull();
    expect(shot).toHaveAttribute('aria-hidden', 'true');
  }
  expect(slides[1]).toHaveTextContent('Профиль загружен');
  expect(slides[1]).toHaveTextContent('Готовим iPhone обычно до 24 часов, пришлём письмо.');
  expect(dialog).toHaveTextContent('Гарантия на весь срок подписки');
});

it('goes through the steps with «Дальше» and ends with the button to connect an iPhone', () => {
  render(<HowSheet />);
  fireEvent.click(screen.getByRole('button', { name: 'Как это работает?' }));
  const dialog = screen.getByRole('dialog');
  const dots = () =>
    within(dialog)
      .getAllByRole('button', { name: /^Шаг \d/ })
      .map((d) => d.getAttribute('aria-current'));
  expect(dots()).toEqual(['step', null, null]);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Дальше' }));
  expect(dots()).toEqual([null, 'step', null]);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Дальше' }));
  expect(dots()).toEqual([null, null, 'step']);
  expect(within(dialog).queryByRole('button', { name: 'Дальше' })).toBeNull();
  expect(within(dialog).getByRole('link', { name: 'Подключить iPhone' })).toHaveAttribute(
    'href',
    '/get',
  );
});

it('closes with the cross', () => {
  render(<HowSheet />);
  fireEvent.click(screen.getByRole('button', { name: 'Как это работает?' }));
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
