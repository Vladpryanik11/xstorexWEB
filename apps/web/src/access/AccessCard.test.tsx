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

const withDevice = (device: { ready: boolean; needsHelp: boolean; family?: 'iphone' | 'ipad' }) =>
  active({
    state: {
      kind: 'active',
      until: new Date('2026-12-18T12:00:00Z'),
      subscriptionId: 'sub_1',
      device: {
        model: device.family === 'ipad' ? 'iPad Air (3-го поколения)' : 'iPhone 15 Pro',
        family: device.family ?? 'iphone',
        ready: device.ready,
        needsHelp: device.needsHelp,
      },
    },
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
    expect(screen.getByRole('link', { name: 'Продлить' })).toHaveAttribute('href', '/get?renew=1');
    expect(screen.getByText('buyer@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Оформить доступ' })).toBeNull();
  });

  it('no device yet: «Подключить iPhone» leads to the connect step', () => {
    render(<AccessCard access={active()} />);
    expect(screen.getByRole('link', { name: 'Подключить iPhone' })).toHaveAttribute(
      'href',
      '/get/iphone',
    );
  });

  it('no device yet, seen on an iPad: «Подключить iPad»', () => {
    render(<AccessCard access={active()} family="ipad" />);
    expect(screen.getByRole('link', { name: 'Подключить iPad' })).toHaveAttribute(
      'href',
      '/get/iphone',
    );
  });

  it('a device being prepared: the model and «Готовим, обычно до 24 часов»', () => {
    render(<AccessCard access={withDevice({ ready: false, needsHelp: false })} />);
    expect(screen.getByText('iPhone 15 Pro · Готовим, обычно до 24 часов')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Подключить/ })).toBeNull();
  });

  it('a ready device: the model and «Готов»', () => {
    render(<AccessCard access={withDevice({ ready: true, needsHelp: false })} />);
    expect(screen.getByText('iPhone 15 Pro · Готов')).toBeInTheDocument();
  });

  it('a connected iPad is called «iPad»', () => {
    render(<AccessCard access={withDevice({ ready: true, needsHelp: false, family: 'ipad' })} />);
    const line = screen.getByText('iPad Air (3-го поколения) · Готов');
    expect(line.closest('div')).toHaveTextContent(/^iPad/);
  });

  it('a device that needs a hand: a calm line with a link to support, no technical words', () => {
    const { container } = render(
      <AccessCard access={withDevice({ ready: false, needsHelp: true })} />,
    );
    expect(screen.getByRole('link', { name: 'Нужна помощь поддержки' })).toHaveAttribute(
      'href',
      '/support',
    );
    expect(screen.queryByText(/Готов/)).toBeNull();
    expect(container.textContent).not.toMatch(/аккаунт|UDID|профил|сертификат|блок|истёк/i);
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
