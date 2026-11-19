import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

const nav = vi.hoisted(() => ({ pathname: '/faq/abc' }));

vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

const getAccess = vi.hoisted(() => vi.fn());
vi.mock('../checkout/browser-api', () => ({ browserApi: () => ({ getAccess }) }));

const SUB = { signedIn: true, hasAccess: true };
const GUEST = { signedIn: false, hasAccess: false };

// jsdom has no matchMedia: this one answers only the ≥48em query and lets a test cross it.
const viewport = {
  wide: false,
  listeners: new Set<() => void>(),
  resize(wide: boolean) {
    viewport.wide = wide;
    for (const listener of viewport.listeners) listener();
  },
};

beforeEach(() => {
  nav.pathname = '/faq/abc';
  getAccess.mockReset();
  getAccess.mockResolvedValue({ state: { kind: 'none' } });
  viewport.wide = false;
  viewport.listeners.clear();
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return query === '(min-width: 48em)' && viewport.wide;
    },
    addEventListener: (_type: 'change', listener: () => void) => viewport.listeners.add(listener),
    removeEventListener: (_type: 'change', listener: () => void) =>
      viewport.listeners.delete(listener),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Header', () => {
  it('subscriber header marks the active item and leads to «Мой доступ»', () => {
    render(<Header nav={SUB} />);
    expect(screen.getByRole('link', { name: 'Вопросы' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Мой доступ' })).toHaveAttribute('href', '/access');
    expect(screen.queryByRole('link', { name: 'Войти' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Выйти' })).toBeNull();
    expect(screen.queryByText('Русский')).toBeNull();
  });

  it('without a forced state it starts as a guest and asks the API after mount', async () => {
    getAccess.mockResolvedValue({
      state: { kind: 'active', until: new Date(), subscriptionId: 's', device: null },
      email: 'a@b.ru',
      hasPassword: true,
    });
    render(<Header />);
    expect(screen.getByRole('link', { name: 'Войти' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Мой доступ' })).toHaveAttribute(
      'href',
      '/access',
    );
    expect(screen.queryByRole('link', { name: 'Войти' })).toBeNull();
    expect(getAccess).toHaveBeenCalledTimes(1);
  });

  it('stays a guest when the API cannot be reached', async () => {
    getAccess.mockRejectedValue(new Error('offline'));
    render(<Header />);
    await waitFor(() => expect(getAccess).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/signin');
  });

  it('guest header offers pricing and login', () => {
    render(<Header nav={GUEST} />);
    expect(screen.getByRole('link', { name: 'Тарифы' })).toHaveAttribute('href', '/pricing');
    expect(screen.queryByRole('link', { name: 'Установить' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/signin');
  });

  it('narrows into the compact pill after 24px of scroll', () => {
    render(<Header nav={GUEST} />);
    const header = screen.getByRole('banner');
    expect(header).toHaveAttribute('data-scrolled', 'false');
    act(() => {
      vi.stubGlobal('scrollY', 30);
      window.dispatchEvent(new Event('scroll'));
    });
    expect(header).toHaveAttribute('data-scrolled', 'true');
    act(() => {
      vi.stubGlobal('scrollY', 10);
      window.dispatchEvent(new Event('scroll'));
    });
    expect(header).toHaveAttribute('data-scrolled', 'false');
  });

  it('only the active item carries the sliding highlight', () => {
    render(<Header nav={SUB} />);
    const row = screen.getByRole('navigation', { name: 'Основное меню' });
    const pills = row.querySelectorAll('[data-nav-highlight]');
    expect(pills).toHaveLength(1);
    expect(pills[0]?.closest('a')).toHaveTextContent('Вопросы');
  });

  it('has no logo: no image and no «на главную» link in the pill', () => {
    const { container } = render(<Header nav={GUEST} />);
    expect(container.querySelector('header img')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Xstore, на главную' })).toBeNull();
  });

  it('forcedPath overrides the current path', () => {
    render(<Header nav={SUB} forcedPath="/support" />);
    expect(screen.getByRole('link', { name: 'Поддержка' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Вопросы' })).not.toHaveAttribute('aria-current');
  });
});

describe('MobileMenu', () => {
  it('burger opens the card menu: catalog, access and help cards', () => {
    render(<Header nav={SUB} />);
    const burger = screen.getByRole('button', { name: 'Меню' });
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(burger);

    expect(burger).toHaveAttribute('aria-expanded', 'true');
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    const cards = within(sheet).getAllByRole('group');
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'Каталог',
      'Доступ',
      'Помощь',
    ]);
    const labels = (card: HTMLElement) =>
      within(card)
        .getAllByRole('link')
        .map((link) => link.textContent);
    expect(labels(cards[0] as HTMLElement)).toEqual([
      'Весь каталог',
      'Удалённые из App Store',
      'Premium доступы',
      'Популярные',
      'Поиск',
    ]);
    expect(labels(cards[1] as HTMLElement)).toEqual(['Мой доступ']);
    expect(labels(cards[2] as HTMLElement)).toEqual(['Блог', 'Вопросы', 'Поддержка']);
    expect(within(sheet).getByRole('link', { name: 'Вопросы' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('guest access card offers pricing and login', () => {
    render(<Header nav={GUEST} />);
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    const account = within(screen.getByRole('dialog')).getByRole('group', { name: 'Доступ' });
    expect(within(account).getByRole('link', { name: 'Тарифы' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(within(account).getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/signin');
  });

  it('Escape closes the sheet and returns focus to the burger', () => {
    vi.useFakeTimers();
    try {
      render(<Header nav={SUB} />);
      const burger = screen.getByRole('button', { name: 'Меню' });
      fireEvent.click(burger);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(burger).toHaveAttribute('aria-expanded', 'false');
      expect(burger).toHaveFocus();

      // The sheet slides out (.22s), hidden and inert, then leaves the DOM.
      const leaving = document.querySelector('[role="dialog"]');
      expect(leaving).toHaveAttribute('aria-hidden', 'true');
      expect(leaving).toHaveAttribute('inert');
      act(() => {
        vi.advanceTimersByTime(220);
      });
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Tab from the last sheet link wraps to the burger', () => {
    render(<Header nav={SUB} />);
    const burger = screen.getByRole('button', { name: 'Меню' });
    fireEvent.click(burger);
    const links = within(screen.getByRole('dialog')).getAllByRole('link');
    expect(links[0]).toHaveFocus();

    links[links.length - 1]?.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(burger).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(links[links.length - 1]).toHaveFocus();
  });

  it('closes when the route changes from outside the sheet (back/forward)', () => {
    const { rerender } = render(<Header nav={SUB} />);
    const burger = screen.getByRole('button', { name: 'Меню' });
    fireEvent.click(burger);
    expect(within(screen.getByRole('dialog')).getAllByRole('link')[0]).toHaveFocus();

    nav.pathname = '/blog';
    rerender(<Header nav={SUB} />);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    // Focus was inside the sheet, so it goes back to the burger instead of being lost.
    expect(burger).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Блог' })).toHaveAttribute('aria-current', 'page');
  });

  it('closes when a header link above the sheet navigates, keeping focus on that link', () => {
    const { rerender } = render(<Header nav={GUEST} />);
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    const pricing = screen
      .getAllByRole('link', { name: 'Тарифы' })
      .find((link) => !link.closest('[role="dialog"]'));
    if (!pricing) throw new Error('no «Тарифы» pill above the sheet');
    pricing.focus();

    nav.pathname = pricing.getAttribute('href') ?? '/pricing';
    rerender(<Header nav={GUEST} />);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(pricing).toHaveFocus();
  });

  it('a forced path does not close the sheet', () => {
    const { rerender } = render(<Header nav={SUB} forcedPath="/faq" />);
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));

    rerender(<Header nav={SUB} forcedPath="/support" />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes when the viewport grows past 48em (iPad rotation)', () => {
    render(<Header nav={SUB} />);
    const burger = screen.getByRole('button', { name: 'Меню' });
    fireEvent.click(burger);

    // Still narrow: a change event alone does not close the sheet.
    act(() => viewport.resize(false));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => viewport.resize(true));

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    expect(viewport.listeners.size).toBe(0);
    // The sheet's keyboard handler is gone too: Escape no longer starts a slide-out.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('a second burger click closes the sheet', () => {
    render(<Header nav={SUB} />);
    const burger = screen.getByRole('button', { name: 'Меню' });
    fireEvent.click(burger);
    fireEvent.click(burger);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(burger).toHaveFocus();
  });
});
