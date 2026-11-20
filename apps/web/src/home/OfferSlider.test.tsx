import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OfferSlider } from './OfferSlider';

function stubMedia(phone: boolean, reduced = false) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('reduce') ? reduced : phone,
    addEventListener() {},
    removeEventListener() {},
  }));
}

const slides = ['Удалённые из App Store', 'Premium‑доступы', 'Проверенные сертификаты'].map((t) => (
  <li key={t}>{t}</li>
));

const activeDot = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-dot]')].findIndex((d) => d.getAttribute('data-on') === 'true');

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('keeps every slide in one labelled list with a dot per slide', () => {
  stubMedia(true);
  const { container } = render(<OfferSlider label="Что входит в подписку">{slides}</OfferSlider>);
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByRole('list', { name: 'Что входит в подписку' })).toBeVisible();
  expect(container.querySelectorAll('[data-dot]')).toHaveLength(3);
  expect(activeDot(container)).toBe(0);
});

it('turns the slides by itself on a phone and wraps around', () => {
  stubMedia(true);
  const { container } = render(<OfferSlider label="x">{slides}</OfferSlider>);
  act(() => vi.advanceTimersByTime(3500));
  expect(activeDot(container)).toBe(1);
  act(() => vi.advanceTimersByTime(7000));
  expect(activeDot(container)).toBe(0);
});

it('stands still on a computer and when motion is reduced', () => {
  stubMedia(false);
  const a = render(<OfferSlider label="x">{slides}</OfferSlider>);
  act(() => vi.advanceTimersByTime(8000));
  expect(activeDot(a.container)).toBe(0);
  a.unmount();

  stubMedia(true, true);
  const b = render(<OfferSlider label="x">{slides}</OfferSlider>);
  act(() => vi.advanceTimersByTime(8000));
  expect(activeDot(b.container)).toBe(0);
});
