import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AccessResponse } from '@xstore/shared';
import { describe, expect, it, vi } from 'vitest';
import { AccessCard } from './AccessCard';

const active = (over: Partial<AccessResponse> = {}): AccessResponse => ({
  state: {
    kind: 'active',
    until: new Date('2026-12-18T12:00:00Z'),
    subscriptionId: 'sub_1',
    device: null,
  },
  email: 'buyer@example.com',
  hasPassword: true,
  ...over,
});

const none: AccessResponse = {
  state: { kind: 'none' },
  email: 'buyer@example.com',
  hasPassword: true,
};

describe('AccessCard', () => {
  it('active access: the date, the device line and «Продлить»', () => {
    render(<AccessCard access={active()} />);
    expect(
      screen.getByRole('heading', { name: 'Доступ активен до 18 декабря 2026' }),
    ).toBeVisible();
    expect(screen.getByText('Устройство ещё не подключено')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Продлить' })).toHaveAttribute('href', '/get?renew=1');
    expect(screen.getByText('buyer@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Оформить доступ' })).toBeNull();
  });

  it('no access: «Доступа нет» and «Оформить доступ»', () => {
    render(<AccessCard access={none} />);
    expect(screen.getByRole('heading', { name: 'Доступа нет' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Оформить доступ' })).toHaveAttribute('href', '/get');
    expect(screen.queryByRole('link', { name: 'Продлить' })).toBeNull();
  });

  it('an order awaiting payment can be continued', () => {
    render(
      <AccessCard access={{ ...none, state: { kind: 'payment_pending', orderId: 'ord_1' } }} />,
    );
    expect(screen.getByRole('link', { name: 'Продолжить оплату' })).toHaveAttribute(
      'href',
      '/get/ord_1',
    );
  });

  it('offers «Задать пароль» only without a password', () => {
    const { unmount } = render(<AccessCard access={active({ hasPassword: false })} />);
    expect(screen.getByRole('heading', { name: 'Задать пароль' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Пропустить' })).toBeNull();
    unmount();
    render(<AccessCard access={active()} />);
    expect(screen.queryByRole('heading', { name: 'Задать пароль' })).toBeNull();
  });

  it('links to support', () => {
    render(<AccessCard access={active()} />);
    expect(screen.getByRole('link', { name: 'Написать в поддержку' })).toHaveAttribute(
      'href',
      '/support',
    );
  });

  it('«Выйти» signs out and returns to the home page', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const go = vi.fn();
    render(<AccessCard access={active()} logout={logout} go={go} />);
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    await waitFor(() => expect(go).toHaveBeenCalledWith('/'));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('a failed sign-out says so and stays', async () => {
    const logout = vi.fn().mockRejectedValue(new Error('offline'));
    const go = vi.fn();
    render(<AccessCard access={active()} logout={logout} go={go} />);
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не получилось выйти');
    expect(go).not.toHaveBeenCalled();
  });
});
