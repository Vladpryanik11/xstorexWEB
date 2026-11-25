import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Footer } from './Footer';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Footer', () => {
  it('shows the brand, the site links and the copyright', () => {
    render(<Footer />);
    // Owner 2026-11-25 (ПК, пункт 9): the brand is Xstorex everywhere.
    const brand = screen.getByRole('link', { name: 'Xstorex' });
    expect(brand).toHaveAttribute('href', '/');
    expect(brand.querySelector('img')).toHaveAttribute('src', '/brand/mark.png');
    const links: [string, string][] = [
      ['Вопросы', '/faq'],
      // Support is by mail only, so the footer shows the address (there is no /support page).
      ['support@xstorex.app', 'mailto:support@xstorex.app'],
      ['Контакты', '/legal'],
      ['Пользовательское соглашение', '/terms'],
      ['Политика конфиденциальности', '/privacy'],
      ['Согласие на обработку данных', '/consent'],
      ['Возврат средств', '/refunds'],
    ];
    for (const [name, href] of links) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    // The blog comes in stage 2 (plan 2026-11-21, 1.2).
    expect(screen.queryByRole('link', { name: 'Блог' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Поддержка' })).toBeNull();
    expect(screen.queryByText(/Только с правами на распространение/)).toBeNull();
    expect(screen.getByText('© 2026 Xstorex')).toBeInTheDocument();
  });

  it('has no Telegram link without NEXT_PUBLIC_TELEGRAM_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_URL', '');
    render(<Footer />);
    expect(screen.queryByRole('link', { name: 'Telegram' })).toBeNull();
  });

  it('links Telegram when NEXT_PUBLIC_TELEGRAM_URL is set', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_URL', 'https://t.me/xstore');
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'Telegram' })).toHaveAttribute(
      'href',
      'https://t.me/xstore',
    );
  });
});
