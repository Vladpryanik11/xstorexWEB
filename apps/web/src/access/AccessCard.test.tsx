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

const SINCE = new Date('2026-11-20T10:40:00Z');
const hoursAfter = (h: number) => new Date(SINCE.getTime() + h * 3600_000);
const waiting = (updating = false) => {
  const access = withDevice({ ready: false, needsHelp: false });
  if (access.state.kind === 'active' && access.state.device) {
    access.state.device.waitingSince = SINCE;
    access.state.device.updating = updating;
  }
  return access;
};
const TZ = 'Europe/Moscow';

describe('AccessCard waiting', () => {
  it('first hours: «Готовим ваш iPhone», ready-by time and the steps', () => {
    render(<AccessCard access={waiting()} now={hoursAfter(6)} timeZone={TZ} />);
    expect(screen.getByRole('heading', { name: 'Готовим ваш iPhone' })).toBeVisible();
    expect(
      screen.getByText('Обычно до 24 часов. Будет готов до 21 ноября, 13:40.'),
    ).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Шаги' });
    expect(steps).toHaveTextContent('Оплачено');
    expect(steps).toHaveTextContent('iPhone подключён');
    expect(steps).toHaveTextContent('Готовим iPhone');
    expect(steps).toHaveTextContent('Можно ставить');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument();
    expect(screen.queryByText(/Готовим, обычно до 24 часов/)).toBeNull();
  });

  it('after 20 hours: «Почти готово» and the hours left', () => {
    render(<AccessCard access={waiting()} now={hoursAfter(21.5)} timeZone={TZ} />);
    expect(screen.getByRole('heading', { name: 'Почти готово' })).toBeVisible();
    expect(
      screen.getByText('Осталось около 3 ч. Будет готов до 21 ноября, 13:40.'),
    ).toBeInTheDocument();
  });

  it('after 24 hours: «Готовим чуть дольше обычного» and support, no time', () => {
    render(<AccessCard access={waiting()} now={hoursAfter(25)} timeZone={TZ} />);
    expect(screen.getByRole('heading', { name: 'Готовим чуть дольше обычного' })).toBeVisible();
    expect(screen.getByText('Мы уже знаем и занимаемся.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Написать в поддержку' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/Будет готов до/)).toBeNull();
  });

  it('files ended: «Обновляем доступ» as the step and the heading', () => {
    render(<AccessCard access={waiting(true)} now={hoursAfter(2)} timeZone={TZ} />);
    expect(screen.getByRole('heading', { name: 'Обновляем доступ' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Шаги' })).toHaveTextContent('Обновляем доступ');
  });

  it('ready: every step done, no waiting block', () => {
    render(
      <AccessCard access={withDevice({ ready: true, needsHelp: false })} now={hoursAfter(30)} />,
    );
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Шаги' })).toBeNull();
  });
});

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

  it('files ended: the model and «Обновляем доступ, обычно до 24 часов»', () => {
    const access = withDevice({ ready: false, needsHelp: false });
    if (access.state.kind === 'active' && access.state.device) access.state.device.updating = true;
    render(<AccessCard access={access} />);
    expect(
      screen.getByText('iPhone 15 Pro · Обновляем доступ, обычно до 24 часов'),
    ).toBeInTheDocument();
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
