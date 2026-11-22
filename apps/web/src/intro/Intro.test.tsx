import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTRO_KEY } from './decision';
import { Intro } from './Intro';

vi.mock('next/font/google', () => ({
  Unbounded: () => ({ variable: 'var-logo' }),
  JetBrains_Mono: () => ({ variable: 'var-mono' }),
}));

const html = document.documentElement;

describe('Intro (spec 2026-11-22-intro)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    html.removeAttribute('data-intro');
    localStorage.clear();
  });

  it('leaves the page when the pre-paint script did not mark <html>', () => {
    const { container } = render(<Intro />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the gate with launch and skip when marked', () => {
    html.setAttribute('data-intro', 'on');
    render(<Intro />);
    expect(screen.getByRole('dialog', { name: 'Интро Xstorex' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ЗАПУСК/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Пропустить/ })).toBeInTheDocument();
  });

  it('skip remembers the visit, reveals the page and removes itself', () => {
    html.setAttribute('data-intro', 'on');
    const { container } = render(<Intro />);
    fireEvent.click(screen.getByRole('button', { name: /Пропустить/ }));
    expect(localStorage.getItem(INTRO_KEY)).toBe('seen');
    act(() => vi.advanceTimersByTime(800));
    expect(html.dataset.intro).toBe('show');
    act(() => vi.advanceTimersByTime(2500));
    expect(html.hasAttribute('data-intro')).toBe(false);
    expect(container).toBeEmptyDOMElement();
  });

  it('Esc skips too', () => {
    html.setAttribute('data-intro', 'on');
    render(<Intro />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(localStorage.getItem(INTRO_KEY)).toBe('seen');
    act(() => vi.advanceTimersByTime(3300));
    expect(html.hasAttribute('data-intro')).toBe(false);
  });

  it('leaving mid-way gives the page back', () => {
    html.setAttribute('data-intro', 'on');
    const { unmount } = render(<Intro />);
    unmount();
    expect(html.hasAttribute('data-intro')).toBe(false);
  });
});
