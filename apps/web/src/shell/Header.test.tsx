import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

const nav = vi.hoisted(() => ({ pathname: '/devices/abc' }));

vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

beforeEach(() => {
  nav.pathname = '/devices/abc';
});

describe('Header', () => {
  it('signed-in header marks the active item and offers logout', () => {
    render(<Header signedIn />);
    expect(screen.getByRole('link', { name: 'Ваши устройства' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Выйти' })).toHaveAttribute('href', '/signout');
    expect(screen.queryByText('Русский')).toBeNull();
  });

  it('guest header offers install and login', () => {
    render(<Header signedIn={false} />);
    expect(screen.getByRole('link', { name: 'Установить' })).toHaveAttribute('href', '/install');
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/signin');
  });

  it('forcedPath overrides the current path', () => {
    render(<Header signedIn forcedPath="/profile" />);
    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Ваши устройства' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});

describe('MobileMenu', () => {
  it('burger opens a modal side sheet with the menu and the end-group links', () => {
    render(<Header signedIn />);
    const burger = screen.getByRole('button', { name: 'Меню' });
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(burger);

    expect(burger).toHaveAttribute('aria-expanded', 'true');
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    const labels = within(sheet)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual(['Ваши устройства', 'Профиль', 'Блог', 'Вопросы', 'Поддержка', 'Выйти']);
    expect(within(sheet).getByRole('link', { name: 'Ваши устройства' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('guest sheet offers install and login', () => {
    render(<Header signedIn={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('link', { name: 'Установить' })).toHaveAttribute(
      'href',
      '/install',
    );
    expect(within(sheet).getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/signin');
  });

  it('Escape closes the sheet and returns focus to the burger', () => {
    vi.useFakeTimers();
    try {
      render(<Header signedIn />);
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
    render(<Header signedIn />);
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
    const { rerender } = render(<Header signedIn />);
    const burger = screen.getByRole('button', { name: 'Меню' });
    fireEvent.click(burger);
    expect(within(screen.getByRole('dialog')).getAllByRole('link')[0]).toHaveFocus();

    nav.pathname = '/blog';
    rerender(<Header signedIn />);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    // Focus was inside the sheet, so it goes back to the burger instead of being lost.
    expect(burger).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Блог' })).toHaveAttribute('aria-current', 'page');
  });

  it('closes when a header link above the sheet navigates, keeping focus on that link', () => {
    const { rerender } = render(<Header signedIn={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));
    const logo = screen.getByRole('link', { name: 'Xstore, на главную' });
    logo.focus();

    nav.pathname = '/';
    rerender(<Header signedIn={false} />);

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(logo).toHaveFocus();
  });

  it('a forced path does not close the sheet', () => {
    const { rerender } = render(<Header signedIn forcedPath="/devices" />);
    fireEvent.click(screen.getByRole('button', { name: 'Меню' }));

    rerender(<Header signedIn forcedPath="/profile" />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a second burger click closes the sheet', () => {
    render(<Header signedIn />);
    const burger = screen.getByRole('button', { name: 'Меню' });
    fireEvent.click(burger);
    fireEvent.click(burger);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(burger).toHaveFocus();
  });
});
