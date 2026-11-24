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
    'Шаг 1 из 4',
    'Шаг 2 из 4',
    'Шаг 3 из 4',
    'Шаг 4 из 4',
  ]);
  // Owner 2026-11-24 10:28: Developer Mode comes right after the payment, then the profile, then
  // the wait for the email (10:41: a fourth point of the profile step), then the apps.
  expect(slides.map((s) => s.querySelector('h3')?.textContent)).toEqual([
    'Оплатите подписку',
    'Включите режим разработчика',
    'Подключите iPhone',
    'Устанавливайте приложения',
  ]);
  // The step number stands above the title, so a long title is not pushed aside by it.
  expect(slides.map((s) => s.querySelector('[data-how-count]')?.textContent)).toEqual([
    'Шаг 1 из 4',
    'Шаг 2 из 4',
    'Шаг 3 из 4',
    'Шаг 4 из 4',
  ]);
});

// Owner 2026-11-24 10:12 and 10:30: each step shows a small iPhone screen of what the person will
// see there and a short instruction, point by point.
it('shows a small screen and a short instruction on each step', () => {
  render(<HowSheet />);
  fireEvent.click(screen.getByRole('button', { name: 'Как это работает?' }));
  const dialog = screen.getByRole('dialog');
  const slides = within(dialog).getAllByRole('group');
  for (const s of slides) {
    const shot = s.querySelector('[data-how-screen]');
    expect(shot).not.toBeNull();
    expect(shot).toHaveAttribute('aria-hidden', 'true');
  }
  const steps = (k: number) =>
    within(slides[k] as HTMLElement)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
  expect(steps(1)).toEqual([
    'Настройки → Конфиденциальность и безопасность',
    '«Режим разработчика» → включите',
    'После перезагрузки нажмите «Включить»',
  ]);
  expect(steps(2)).toEqual([
    'Откройте сайт в Safari и нажмите «Подключить iPhone»',
    'Настройки → «Профиль загружен»',
    'Нажмите «Установить»',
    'Дождитесь письма о готовности: обычно 2–3 часа в рабочее время',
  ]);
  expect(slides[3]).toHaveTextContent('сертификатом разработчика Apple для вашего iPhone');
  expect(dialog).toHaveTextContent('Гарантия на весь срок подписки');
});

// Owner 2026-11-24 10:34: «нужно донести что это безопасно» — the two steps that may worry people
// say plainly what they do and do not give us.
it('says why Developer Mode and the profile are safe', () => {
  render(<HowSheet />);
  fireEvent.click(screen.getByRole('button', { name: 'Как это работает?' }));
  const slides = within(screen.getByRole('dialog')).getAllByRole('group');
  const safe = (k: number) => slides[k]?.querySelector('[data-how-safe]')?.textContent;
  expect(safe(1)).toBe(
    'Это встроенная настройка Apple. Доступа к вашему iPhone она нам не даёт, выключить её можно там же.',
  );
  expect(safe(2)).toBe(
    'Профиль передаёт только модель iPhone, версию iOS и номер устройства. Фото, сообщения, пароли и Apple ID нам не видны.',
  );
  expect(slides[0]?.querySelector('[data-how-safe]')).toBeNull();
});

it('goes through the steps with «Дальше» and ends with the button to connect an iPhone', () => {
  render(<HowSheet />);
  fireEvent.click(screen.getByRole('button', { name: 'Как это работает?' }));
  const dialog = screen.getByRole('dialog');
  const dots = () =>
    within(dialog)
      .getAllByRole('button', { name: /^Шаг \d/ })
      .map((d) => d.getAttribute('aria-current'));
  expect(dots()).toEqual(['step', null, null, null]);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Дальше' }));
  expect(dots()).toEqual([null, 'step', null, null]);
  for (let k = 0; k < 2; k++) {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Дальше' }));
  }
  expect(dots()).toEqual([null, null, null, 'step']);
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
