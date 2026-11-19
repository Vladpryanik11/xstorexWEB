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
  paymentUrl: 'http://localhost:3000/dev/pay/p1',
  ...over,
});
const paid = order({
  status: 'paid',
  paidAt: '2026-11-18T10:00:00.000Z',
  accessUntil: '2026-12-18T10:00:00.000Z',
  paymentUrl: null,
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
    const live = screen.getByTestId('wizard-status');
    expect(live).toHaveAttribute('role', 'status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Проверяем оплату…');
    await tick(2000);
    expect(getOrder).toHaveBeenCalledTimes(1);
    await tick(2000);
    expect(
      screen.getByRole('heading', { name: 'Доступ активен до 18 декабря 2026' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Придумайте пароль' })).toBeInTheDocument();
    expect(screen.getByTestId('wizard-status')).toHaveTextContent(
      'Доступ активен до 18 декабря 2026',
    );
    expect(sessionStorage.getItem(CHECKOUT_KEY_STORAGE)).toBeNull();
  });

  it('while checking, offers the way back to the payment page from the start', async () => {
    const getOrder = vi.fn().mockResolvedValue(order());
    render(<Wizard initialOrder={order()} hasPassword={false} getOrder={getOrder} />);
    expect(screen.getByRole('link', { name: 'Вернуться к оплате' })).toHaveAttribute(
      'href',
      'http://localhost:3000/dev/pay/p1',
    );
    await tick(120_000);
    expect(screen.getByRole('button', { name: 'Проверить ещё раз' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Вернуться к оплате' })).toBeInTheDocument();
  });

  it('no way back without a payment page, or once the order is settled', () => {
    const { rerender } = render(
      <Wizard initialOrder={order({ paymentUrl: null })} hasPassword={false} getOrder={vi.fn()} />,
    );
    expect(screen.queryByRole('link', { name: 'Вернуться к оплате' })).not.toBeInTheDocument();
    rerender(<Wizard initialOrder={paid} hasPassword getOrder={vi.fn()} />);
    expect(screen.queryByRole('link', { name: 'Вернуться к оплате' })).not.toBeInTheDocument();
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
    expect(screen.getByTestId('wizard-status')).toHaveTextContent('Оплата ещё не подтвердилась');
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
    expect(screen.getByTestId('wizard-status')).toHaveTextContent('Оплата не прошла');
    expect(screen.getByRole('link', { name: 'Попробовать ещё раз' })).toHaveAttribute(
      'href',
      '/get?app=notes',
    );
  });

  it('a refunded order says «Оплата возвращена», not «Оплата не прошла»', () => {
    render(
      <Wizard
        initialOrder={order({ status: 'refunded' })}
        hasPassword={false}
        getOrder={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Оплата возвращена' })).toBeInTheDocument();
    expect(screen.getByTestId('wizard-status')).toHaveTextContent('Оплата возвращена');
    expect(screen.queryByText('Оплата не прошла')).toBeNull();
    expect(screen.getByText('Деньги вернули, доступ по этой оплате закрыт.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Оплатить снова' })).toBeInTheDocument();
  });

  it('skips the password form for a buyer who has one', () => {
    render(<Wizard initialOrder={paid} hasPassword getOrder={vi.fn()} device="ios" />);
    expect(screen.queryByRole('heading', { name: 'Придумайте пароль' })).not.toBeInTheDocument();
    expect(screen.queryByText(/появится в ближайшее время/)).not.toBeInTheDocument();
  });

  it('after payment on iPhone: «Дальше: подключить iPhone»', () => {
    render(<Wizard initialOrder={paid} hasPassword getOrder={vi.fn()} device="ios" />);
    expect(screen.getByRole('link', { name: 'Дальше: подключить iPhone' })).toHaveAttribute(
      'href',
      '/get/iphone',
    );
  });

  it('after payment on iPad: «Дальше: подключить iPad»', () => {
    render(
      <Wizard initialOrder={paid} hasPassword getOrder={vi.fn()} device="ios" family="ipad" />,
    );
    expect(screen.getByRole('link', { name: 'Дальше: подключить iPad' })).toBeInTheDocument();
  });

  it('after payment on a computer: the notice, no connect link', () => {
    render(<Wizard initialOrder={paid} hasPassword getOrder={vi.fn()} device="desktop" />);
    expect(screen.getByText('Откройте сайт на iPhone, чтобы подключить его')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /подключить/ })).toBeNull();
  });

  it('a renewal with a device already connected: no connect step', () => {
    render(<Wizard initialOrder={paid} hasPassword hasDevice getOrder={vi.fn()} device="ios" />);
    expect(screen.queryByRole('link', { name: /подключить/ })).toBeNull();
    expect(screen.queryByText(/Откройте сайт на iPhone/)).toBeNull();
    expect(screen.getByRole('link', { name: 'В каталог' })).toBeInTheDocument();
  });
});
