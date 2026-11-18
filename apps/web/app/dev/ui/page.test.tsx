import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  usePathname: () => '/dev/ui',
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/dev/ui', () => {
  it('dev showcase is hidden without the flag', async () => {
    delete process.env.XSTORE_DEV_PAGES;
    const { default: Page } = await import('./page');
    await expect(
      Promise.resolve().then(() => Page({ searchParams: Promise.resolve({}) })),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders the requested header variant when the flag is set', async () => {
    vi.stubEnv('XSTORE_DEV_PAGES', '1');
    const { default: Page } = await import('./page');
    render(await Page({ searchParams: Promise.resolve({ auth: '1', path: '/faq' }) }));
    const header = within(screen.getByRole('banner'));
    expect(header.getByRole('link', { name: 'Вопросы' })).toHaveAttribute('aria-current', 'page');
    expect(header.getByRole('link', { name: 'Мой доступ' })).toHaveAttribute('href', '/access');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
