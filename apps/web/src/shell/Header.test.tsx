import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

const nav = vi.hoisted(() => ({ pathname: '/faq/abc' }));

vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

const getAccess = vi.hoisted(() => vi.fn());
const section = vi.hoisted(() => vi.fn());
vi.mock('../checkout/browser-api', () => ({ browserApi: () => ({ getAccess, section }) }));

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
  section.mockReset();
  section.mockImplementation(async (slug: string) => ({
    items: [1, 2, 3, 4].map((n) => ({
      slug: `${slug}-${n}`,
      name: `${slug} ${n}`,
      iconUrl: `https://cdn.test/${slug}-${n}.png`,
    })),
  }));
  viewport.wide = false;
  viewport.listeners.clear();
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return (
        (query === '(min-width: 48em)' || query === '(hover: hover) and (pointer: fine)') &&
        viewport.wide
      );
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

  it('guest header offers login and «Подключить iPhone» (owner 2026-11-23)', () => {
    render(<Header nav={GUEST} />);
    const login = screen.getByRole('link', { name: 'Войти' });
    expect(login).toHaveAttribute('href', '/signin');
    // On a phone «Войти» is a person icon without a circle.
    expect(login.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    const connect = screen.getByRole('link', { name: 'Подключить iPhone' });
    expect(connect).toHaveAttribute('href', '/get');
    // Apple-like pill В+ (owner 2026-11-23): the label alone, no icon.
    expect(connect.querySelector('svg')).toBeNull();
    expect(login.compareDocumentPosition(connect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Тарифы' })).toBeNull();
  });

  it('a buyer without access keeps the button and reaches «Мой доступ»', () => {
    render(<Header nav={{ signedIn: true, hasAccess: false }} />);
    expect(screen.getByRole('link', { name: 'Мой доступ' })).toHaveAttribute('href', '/access');
    expect(screen.getByRole('link', { name: 'Подключить iPhone' })).toHaveAttribute('href', '/get');
    expect(screen.queryByRole('link', { name: 'Войти' })).toBeNull();
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

  it('has no logo and no word «Xstorex» (owner 2026-11-23); the menu word leads home', () => {
    const { container } = render(<Header nav={GUEST} />);
    expect(container.querySelector('header img')).toBeNull();
    expect(screen.queryByRole('link', { name: /Xstorex/ })).toBeNull();
    expect(container.querySelector('header')).not.toHaveTextContent('Xstorex');
    const pill = screen.getByRole('navigation', { name: 'Основное меню' }).parentElement;
    expect(pill?.firstElementChild).toBe(screen.getByRole('navigation', { name: 'Основное меню' }));
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    // Owner 2026-11-25: the phone menu opens with the word «Xstorex», a link home, not «Главная».
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('link', { name: 'Xstorex, на главную' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(within(sheet).queryByRole('link', { name: 'Главная' })).toBeNull();
  });

  it('forcedPath overrides the current path', () => {
    render(<Header nav={SUB} forcedPath="/faq" />);
    expect(screen.getByRole('link', { name: 'Вопросы' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Как это работает' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  // Owner 2026-11-25 (ПК, пункт 3): the blog page does not exist yet, so no link leads there.
  it('has no «Блог» link while there is no blog', () => {
    render(<Header nav={SUB} />);
    expect(screen.queryByRole('link', { name: 'Блог' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    expect(within(screen.getByRole('dialog')).queryByRole('link', { name: 'Блог' })).toBeNull();
  });
});

describe('MobileMenu', () => {
  // Owner 2026-11-25 (spec 2026-11-25-mobile-menu-design): one white panel, a blue subscription
  // card, the catalog large, secondary pages small and grey, the support mail at the bottom.
  it('burger opens one panel: word, subscription card, catalog, secondary pages, support', () => {
    render(<Header nav={SUB} />);
    const burger = screen.getByRole('button', { name: 'Меню' });
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(burger);

    expect(burger).toHaveAttribute('aria-expanded', 'true');
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    // No group captions and no cards inside the panel any more.
    expect(within(sheet).queryAllByRole('group')).toHaveLength(0);
    expect(
      within(sheet)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Xstorex',
      'Мой доступ',
      'Удалённые из App Store',
      'Premium доступы',
      'Поиск',
      'Как это работает',
      'Вопросы',
      'support@xstorex.app',
    ]);
    expect(within(sheet).getByText('Подписка активна')).toBeVisible();
    expect(within(sheet).getByText('Весь каталог уже ваш')).toBeVisible();
    expect(within(sheet).getByRole('link', { name: 'Мой доступ' })).toHaveAttribute(
      'href',
      '/access',
    );
    // Support is by mail (no /support page).
    expect(within(sheet).getByRole('link', { name: 'support@xstorex.app' })).toHaveAttribute(
      'href',
      'mailto:support@xstorex.app',
    );
    expect(within(sheet).getByText(/Поддержка/)).toBeVisible();
    expect(within(sheet).getByRole('link', { name: 'Вопросы' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('the catalog and the secondary pages are two lists, the rows have no icons', () => {
    render(<Header nav={GUEST} />);
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    const sheet = screen.getByRole('dialog');
    const catalog = within(sheet).getByRole('list', { name: 'Каталог' });
    expect(
      within(catalog)
        .getAllByRole('link')
        .map((l) => l.getAttribute('href')),
    ).toEqual(['/removed', '/premium', '/search']);
    const more = within(sheet).getByRole('list', { name: 'Ещё' });
    expect(
      within(more)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Как это работает', 'Вопросы', 'Тарифы']);
    for (const list of [catalog, more]) {
      expect(list.querySelector('svg')).toBeNull();
    }
  });

  it('a guest gets «Подключить iPhone» and the glass button «Есть доступ? Войти» in the card', () => {
    render(<Header nav={GUEST} />);
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Весь каталог в одной подписке')).toBeVisible();
    expect(within(sheet).getByRole('link', { name: 'Подключить iPhone' })).toHaveAttribute(
      'href',
      '/get',
    );
    expect(within(sheet).getByRole('link', { name: 'Есть доступ? Войти' })).toHaveAttribute(
      'href',
      '/signin',
    );
    expect(within(sheet).getByRole('link', { name: 'Тарифы' })).toHaveAttribute('href', '/pricing');
  });

  it('signed in without access: the glass button leads to «Мой доступ»', () => {
    render(<Header nav={{ signedIn: true, hasAccess: false }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('link', { name: 'Подключить iPhone' })).toBeVisible();
    expect(within(sheet).getByRole('link', { name: 'Мой доступ' })).toHaveAttribute(
      'href',
      '/access',
    );
    expect(within(sheet).queryByRole('link', { name: /Войти/ })).toBeNull();
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

    nav.pathname = '/faq';
    rerender(<Header nav={SUB} />);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    // Focus was inside the sheet, so it goes back to the burger instead of being lost.
    expect(burger).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Вопросы' })).toHaveAttribute('aria-current', 'page');
  });

  it('closes when a header link above the sheet navigates, keeping focus on that link', () => {
    const { rerender } = render(<Header nav={GUEST} />);
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    const connect = screen
      .getAllByRole('link', { name: 'Подключить iPhone' })
      .find((link) => !link.closest('[role="dialog"]'));
    if (!connect) throw new Error('no «Подключить» button above the sheet');
    connect.focus();

    nav.pathname = connect.getAttribute('href') ?? '/get';
    rerender(<Header nav={GUEST} />);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(connect).toHaveFocus();
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

describe('CatalogMenu', () => {
  const button = () => screen.getByRole('button', { name: 'Каталог' });
  const panel = () => document.getElementById(button().getAttribute('aria-controls') ?? '');

  it('«Каталог» leads the menu row: how it works, questions', () => {
    render(<Header nav={GUEST} />);
    const row = screen.getByRole('navigation', { name: 'Основное меню' });
    const names = within(row)
      .getAllByRole('listitem')
      .map((li) => li.firstElementChild?.textContent);
    expect(names.slice(0, 3)).toEqual(['Каталог', 'Как это работает', 'Вопросы']);
    expect(names).not.toContain('Блог');
    expect(button()).toHaveAttribute('aria-expanded', 'false');
    expect(panel()).toBeNull();
  });

  it('a click opens the panel: two sections, search and pricing', () => {
    render(<Header nav={GUEST} />);
    fireEvent.click(button());
    expect(button()).toHaveAttribute('aria-expanded', 'true');
    const box = panel() as HTMLElement;
    expect(box).not.toBeNull();
    const links = within(box)
      .getAllByRole('link')
      .map((a) => [
        a.querySelector('[data-title]')?.textContent ?? a.textContent,
        a.getAttribute('href'),
      ]);
    expect(links).toEqual([
      ['Удалённые из App Store', '/removed'],
      ['Premium доступы', '/premium'],
      ['Поиск', '/search'],
      ['Смотреть тарифы', '/pricing'],
    ]);
    fireEvent.click(button());
    expect(button()).toHaveAttribute('aria-expanded', 'false');
  });

  it('a subscriber is led to «Мой доступ» from the blue card', () => {
    render(<Header nav={SUB} />);
    fireEvent.click(button());
    expect(
      within(panel() as HTMLElement).getByRole('link', { name: 'Мой доступ' }),
    ).toHaveAttribute('href', '/access');
  });

  it('Escape closes the panel and returns focus to «Каталог»', () => {
    render(<Header nav={GUEST} />);
    fireEvent.click(button());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button()).toHaveAttribute('aria-expanded', 'false');
    expect(panel()).toBeNull();
    expect(button()).toHaveFocus();
  });

  it('a click outside the panel closes it', () => {
    render(<Header nav={GUEST} />);
    fireEvent.click(button());
    fireEvent.pointerDown(document.body);
    expect(button()).toHaveAttribute('aria-expanded', 'false');
  });

  it('with a mouse it opens on hover and closes shortly after the pointer leaves', () => {
    vi.useFakeTimers();
    try {
      viewport.wide = true;
      render(<Header nav={GUEST} />);
      fireEvent.mouseEnter(button());
      expect(button()).toHaveAttribute('aria-expanded', 'true');
      fireEvent.mouseLeave(
        screen.getByRole('navigation', { name: 'Основное меню' }).parentElement as HTMLElement,
      );
      expect(button()).toHaveAttribute('aria-expanded', 'true');
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(button()).toHaveAttribute('aria-expanded', 'false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('hovering another menu item closes the panel', () => {
    viewport.wide = true;
    render(<Header nav={GUEST} />);
    fireEvent.mouseEnter(button());
    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Вопросы' }));
    expect(button()).toHaveAttribute('aria-expanded', 'false');
  });

  it('without a mouse hover does not open it, a tap does', () => {
    render(<Header nav={GUEST} />);
    fireEvent.mouseEnter(button());
    expect(button()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button());
    expect(button()).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows three app icons per section, loaded once', async () => {
    render(<Header nav={GUEST} />);
    fireEvent.click(button());
    const removed = within(panel() as HTMLElement).getByRole('link', { name: /Удалённые/ });
    await waitFor(() => expect(removed.querySelectorAll('img')).toHaveLength(3));
    expect(removed.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/removed-1.png');
    fireEvent.click(button());
    fireEvent.click(button());
    expect(section).toHaveBeenCalledTimes(2);
    expect(section.mock.calls.map((c) => c[0])).toEqual(['removed', 'premium']);
  });

  it('keeps the line icon when the section cannot be loaded', async () => {
    section.mockRejectedValue(new Error('offline'));
    render(<Header nav={GUEST} />);
    fireEvent.click(button());
    await waitFor(() => expect(section).toHaveBeenCalledTimes(2));
    const removed = within(panel() as HTMLElement).getByRole('link', { name: /Удалённые/ });
    expect(removed.querySelector('img')).toBeNull();
    expect(removed.querySelector('svg')).not.toBeNull();
  });

  it('marks «Каталог» current on the catalog, its sections and search', () => {
    for (const path of ['/premium', '/removed', '/search']) {
      const { unmount } = render(<Header nav={GUEST} forcedPath={path} />);
      expect(button()).toHaveAttribute('data-current', 'true');
      expect(
        screen
          .getByRole('navigation', { name: 'Основное меню' })
          .querySelectorAll('[data-nav-highlight]'),
      ).toHaveLength(1);
      unmount();
    }
    render(<Header nav={GUEST} forcedPath="/faq" />);
    expect(button()).not.toHaveAttribute('data-current');
  });
});
