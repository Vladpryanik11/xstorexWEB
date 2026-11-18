import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: vi.fn(),
  usePathname: () => '/dev/pay/p1',
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('./actions', () => ({ settleFakePayment: () => undefined }));

afterEach(() => {
  vi.unstubAllEnvs();
});

const params = Promise.resolve({ id: 'p1' });
const searchParams = Promise.resolve({});

describe('/dev/pay/[id]', () => {
  it('is hidden without the flag', async () => {
    vi.stubEnv('XSTORE_DEV_PAGES', '');
    const { default: Page } = await import('./page');
    await expect(Promise.resolve().then(() => Page({ params, searchParams }))).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('offers «Оплатить» and «Отказать» with the flag', async () => {
    vi.stubEnv('XSTORE_DEV_PAGES', '1');
    const { default: Page } = await import('./page');
    render(await Page({ params, searchParams }));
    expect(screen.getByRole('button', { name: 'Оплатить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отказать' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a plain message after a failed attempt', async () => {
    vi.stubEnv('XSTORE_DEV_PAGES', '1');
    const { default: Page } = await import('./page');
    render(await Page({ params, searchParams: Promise.resolve({ error: '1' }) }));
    expect(screen.getByRole('alert')).toHaveTextContent('Не получилось');
  });
});
