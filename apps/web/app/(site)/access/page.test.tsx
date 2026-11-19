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

describe('/access', () => {
  it('sends a visitor without a buyer session to sign-in', async () => {
    api.getAccess.mockResolvedValue({ state: { kind: 'none' } });
    const { default: Page } = await import('./page');
    await expect(Page()).rejects.toThrow('REDIRECT /signin?next=/access');
  });

  it('shows «Мой доступ» to a signed-in buyer', async () => {
    api.getAccess.mockResolvedValue({
      state: { kind: 'none' },
      email: 'buyer@example.com',
      hasPassword: true,
    });
    const { default: Page } = await import('./page');
    render(await Page());
    expect(screen.getByRole('heading', { level: 1, name: 'Мой доступ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Доступа нет' })).toBeInTheDocument();
  });
});
