import { render, screen } from '@testing-library/react';
import type { AccessResponse } from '@xstore/shared';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const api = { getAccess: vi.fn<() => Promise<AccessResponse>>() };
vi.mock('../../../src/api/server', () => ({ serverApi: async () => api }));

const buyer: AccessResponse = {
  state: { kind: 'none' },
  email: 'buyer@example.com',
  hasPassword: true,
};
const params = (next?: string) => ({ searchParams: Promise.resolve(next ? { next } : {}) });

describe('/signin', () => {
  it('a signed-in buyer goes straight to the safe next page', async () => {
    api.getAccess.mockResolvedValue(buyer);
    const { default: Page } = await import('./page');
    await expect(Page(params('/?app=tg'))).rejects.toThrow('REDIRECT /?app=tg');
  });

  it('a signed-in buyer without a safe next goes to «Мой доступ»', async () => {
    api.getAccess.mockResolvedValue(buyer);
    const { default: Page } = await import('./page');
    await expect(Page(params('https://evil.example'))).rejects.toThrow('REDIRECT /access');
  });

  it('a guest gets the form', async () => {
    api.getAccess.mockResolvedValue({ state: { kind: 'none' } });
    const { default: Page } = await import('./page');
    render(await Page(params('/access')));
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeInTheDocument();
  });

  it('the form still opens when the API cannot answer', async () => {
    api.getAccess.mockRejectedValue(new Error('down'));
    const { default: Page } = await import('./page');
    render(await Page(params()));
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
  });
});
