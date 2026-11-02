import { render, screen } from '@testing-library/react';
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
    render(await Page({ searchParams: Promise.resolve({ auth: '1', path: '/profile' }) }));
    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Выйти' })).toHaveAttribute('href', '/signout');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
