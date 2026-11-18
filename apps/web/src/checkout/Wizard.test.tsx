import { act, fireEvent, render, screen } from '@testing-library/react';
import type { OrderView } from '@xstore/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wizard } from './Wizard';
import { CHECKOUT_KEY_STORAGE } from './wizard-step';

const order = (over: Partial<OrderView> = {}): OrderView => ({
  id: 'ord_1',
  status: 'pending',
  amountRub: 299,
  paidAt: null,
  returnTo: null,
  accessUntil: null,
  ...over,
});
const paid = order({
  status: 'paid',
  paidAt: '2026-11-18T10:00:00.000Z',
  accessUntil: '2026-12-18T10:00:00.000Z',
});

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('Wizard', () => {
  it('polls while checking and shows the access date once paid', async () => {
    sessionStorage.setItem(CHECKOUT_KEY_STORAGE, 'k');
    const getOrder = vi.fn().mockResolvedValueOnce(order()).mockResolvedValue(paid);
    render(<Wizard initialOrder={order()} hasPassword={false} getOrder={getOrder} />);
    expect(screen.getByRole('heading', { name: 'Проверяем оплату…' })).toBeInTheDocument();
    await tick(2000);
    expect(getOrder).toHaveBeenCalledTimes(1);
    await tick(2000);
    expect(
      screen.getByRole('heading', { name: 'Доступ активен до 18 декабря 2026' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Придумайте пароль' })).toBeInTheDocument();
    expect(sessionStorage.getItem(CHECKOUT_KEY_STORAGE)).toBeNull();
  });

  it('after 2 minutes stops calmly and can check again', async () => {
    const getOrder = vi.fn().mockResolvedValue(order());
    render(<Wizard initialOrder={order()} hasPassword={false} getOrder={getOrder} />);
    await tick(120_000);
    const calls = getOrder.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(60);
    await tick(10_000);
    expect(getOrder).toHaveBeenCalledTimes(calls);
    expect(screen.queryByRole('heading', { name: 'Проверяем оплату…' })).not.toBeInTheDocument();
    getOrder.mockResolvedValue(paid);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить ещё раз' }));
    await tick(2000);
    expect(screen.getByRole('heading', { name: /Доступ активен до/ })).toBeInTheDocument();
  });

  it('a failed payment offers to pay again', () => {
    render(
      <Wizard
        initialOrder={order({ status: 'failed', returnTo: '/app/notes' })}
        hasPassword={false}
        getOrder={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Оплата не прошла' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Попробовать ещё раз' })).toHaveAttribute(
      'href',
      '/get?app=notes',
    );
  });

  it('skips the password form for a buyer who has one; the iPhone stub is dev-only', () => {
    const { rerender } = render(
      <Wizard initialOrder={paid} hasPassword getOrder={vi.fn()} devPages={false} />,
    );
    expect(screen.queryByRole('heading', { name: 'Придумайте пароль' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Подключение iPhone появится/)).not.toBeInTheDocument();
    rerender(<Wizard initialOrder={paid} hasPassword getOrder={vi.fn()} devPages />);
    expect(screen.getByText('Подключение iPhone появится в ближайшее время')).toBeInTheDocument();
  });
});
