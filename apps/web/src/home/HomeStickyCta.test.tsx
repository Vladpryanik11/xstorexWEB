import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HomeStickyCta } from './HomeStickyCta';

type Entry = { target: Element; isIntersecting: boolean; boundingClientRect: { top: number } };
let fire: (entries: Entry[]) => void = () => {};

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: (entries: Entry[]) => void) {
        fire = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  document.body.innerHTML = '<a data-hero-cta href="/get">x</a><footer></footer>';
});

afterEach(() => vi.unstubAllGlobals());

const heroCta = () => document.querySelector('[data-hero-cta]') as Element;
const footer = () => document.querySelector('footer') as Element;

it('stays hidden while the hero button is on screen', () => {
  render(<HomeStickyCta />);
  expect(screen.queryByRole('link', { name: /Подключить iPhone/ })).toBeNull();
});

it('shows the button once the hero button scrolls away, and hides it over the footer', () => {
  render(<HomeStickyCta />);
  act(() => fire([{ target: heroCta(), isIntersecting: false, boundingClientRect: { top: -80 } }]));
  const link = screen.getByRole('link', { name: /Подключить iPhone/ });
  expect(link).toHaveAttribute('href', '/get');
  expect(screen.getByText('200+ приложений')).toBeVisible();
  expect(screen.getByText(/^с\sPremium‑доступом$/)).toBeVisible();

  act(() => fire([{ target: footer(), isIntersecting: true, boundingClientRect: { top: 400 } }]));
  expect(screen.queryByRole('link', { name: /Подключить iPhone/ })).toBeNull();
});

it('does not show the button before the hero (page opened above it)', () => {
  render(<HomeStickyCta />);
  act(() => fire([{ target: heroCta(), isIntersecting: false, boundingClientRect: { top: 900 } }]));
  expect(screen.queryByRole('link', { name: /Подключить iPhone/ })).toBeNull();
});
