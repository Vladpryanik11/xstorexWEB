import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Footer } from './Footer';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Footer', () => {
  it('shows the brand, the site links and the copyright', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'Xstore' })).toHaveAttribute('href', '/');
    const links: [string, string][] = [
      ['Блог', '/blog'],
      ['Вопросы', '/faq'],
      ['Поддержка', '/support'],
      ['Условия', '/terms'],
      ['Конфиденциальность', '/privacy'],
    ];
    for (const [name, href] of links) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(screen.getByText('© 2026 Xstore')).toBeInTheDocument();
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
