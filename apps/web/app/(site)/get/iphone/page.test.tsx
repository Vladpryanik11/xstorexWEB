import { render, screen } from '@testing-library/react';
import type { AccessResponse, ChosenApp } from '@xstore/shared';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const api = {
  getAccess: vi.fn<() => Promise<AccessResponse>>(),
  chosenApp: vi.fn<() => Promise<ChosenApp>>(),
};
vi.mock('../../../../src/api/server', () => ({ serverApi: async () => api }));

const until = new Date('2026-12-18T10:00:00Z');

describe('/get/iphone', () => {
  it('a guest is sent to sign in first', async () => {
    api.getAccess.mockResolvedValue({ state: { kind: 'none' } });
    const { default: Page } = await import('./page');
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'REDIRECT /signin?next=/get/iphone',
    );
  });

  it('signed in without access: «Оформить доступ»', async () => {
    api.getAccess.mockResolvedValue({
      state: { kind: 'none' },
      email: 'a@b.ru',
      hasPassword: false,
    });
    const { default: Page } = await import('./page');
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('link', { name: 'Оформить доступ' })).toHaveAttribute('href', '/get');
  });

  it('passes ?r= to the step', async () => {
    api.getAccess.mockResolvedValue({
      state: { kind: 'active', until, subscriptionId: 's', device: null },
      email: 'a@b.ru',
      hasPassword: true,
    });
    const { default: Page } = await import('./page');
    render(await Page({ searchParams: Promise.resolve({ r: 'ENROLLMENT_EXPIRED' }) }));
    expect(screen.getByRole('alert')).toHaveTextContent('Время подключения истекло');
  });

  it('a ready iPhone asks for the app chosen before payment; a failure there is no app', async () => {
    const ready = {
      state: {
        kind: 'active' as const,
        until,
        subscriptionId: 's',
        device: { model: 'iPhone 15', family: 'iphone' as const, ready: true, needsHelp: false },
      },
      email: 'a@b.ru',
      hasPassword: true,
    };
    api.getAccess.mockResolvedValue(ready);
    api.chosenApp.mockRejectedValueOnce(new Error('down'));
    const { default: Page } = await import('./page');
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(api.chosenApp).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'iPhone готов' })).toBeInTheDocument();
  });

  it('no device yet: the chosen app is not asked for', async () => {
    api.chosenApp.mockClear();
    api.getAccess.mockResolvedValue({
      state: { kind: 'active', until, subscriptionId: 's', device: null },
      email: 'a@b.ru',
      hasPassword: true,
    });
    const { default: Page } = await import('./page');
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(api.chosenApp).not.toHaveBeenCalled();
  });
});
