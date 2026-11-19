import { render, screen } from '@testing-library/react';
import type { AccessResponse } from '@xstore/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const api = {
  getAccess: vi.fn<() => Promise<AccessResponse>>(),
  getPlan: vi.fn(),
  app: vi.fn(),
};
vi.mock('../../../src/api/server', () => ({ serverApi: async () => api }));

const searchParams = Promise.resolve({});

beforeEach(() => {
  api.getPlan.mockResolvedValue({ code: 'month', title: 'Месяц', durationDays: 30, priceRub: 299 });
  api.app.mockRejectedValue(new Error('not used'));
});

describe('/get', () => {
  it('continues the order awaiting payment instead of starting a second one', async () => {
    api.getAccess.mockResolvedValue({ state: { kind: 'payment_pending', orderId: 'ord_7' } });
    const { default: Page } = await import('./page');
    await expect(Page({ searchParams })).rejects.toThrow('REDIRECT /get/ord_7');
  });

  it('sends a subscriber with a device to «Мой доступ»', async () => {
    api.getAccess.mockResolvedValue({
      state: {
        kind: 'active',
        until: new Date(),
        subscriptionId: 's',
        device: { model: 'iPhone 15', family: 'iphone', ready: false, needsHelp: false },
      },
    });
    const { default: Page } = await import('./page');
    await expect(Page({ searchParams })).rejects.toThrow('REDIRECT /access');
  });

  it('sends a subscriber without a device to «Подключить iPhone»', async () => {
    api.getAccess.mockResolvedValue({
      state: { kind: 'active', until: new Date(), subscriptionId: 's', device: null },
    });
    const { default: Page } = await import('./page');
    await expect(Page({ searchParams })).rejects.toThrow('REDIRECT /get/iphone');
  });

  it('«Продлить» (?renew=1) shows the payment step to a subscriber', async () => {
    api.getAccess.mockResolvedValue({
      state: { kind: 'active', until: new Date(), subscriptionId: 's', device: null },
      email: 'buyer@example.com',
      hasPassword: true,
    });
    const { default: Page } = await import('./page');
    render(await Page({ searchParams: Promise.resolve({ renew: '1' }) }));
    expect(screen.getByRole('button', { name: /Оплатить 299/ })).toBeInTheDocument();
  });

  it('renewal says when the access will end, not that it starts after payment', async () => {
    api.getAccess.mockResolvedValue({
      state: {
        kind: 'active',
        until: new Date('2026-12-18T12:00:00Z'),
        subscriptionId: 's',
        device: null,
      },
      email: 'buyer@example.com',
      hasPassword: true,
    });
    const { default: Page } = await import('./page');
    render(await Page({ searchParams: Promise.resolve({ renew: '1' }) }));
    expect(screen.getByText('Доступ продлится до 17 января 2027')).toBeInTheDocument();
    expect(screen.queryByText('Подписка начнётся сразу после оплаты')).toBeNull();
  });

  it('shows the payment step to a visitor without access', async () => {
    api.getAccess.mockResolvedValue({ state: { kind: 'none' } });
    const { default: Page } = await import('./page');
    render(await Page({ searchParams }));
    expect(screen.getByRole('button', { name: /Оплатить 299/ })).toBeInTheDocument();
  });
});
