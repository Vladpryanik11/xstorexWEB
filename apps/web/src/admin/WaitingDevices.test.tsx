import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { WaitingDevice } from '@xstore/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WaitingDevices } from './WaitingDevices';

const NOW = new Date('2026-11-20T12:00:00Z');
const device = (over: Partial<WaitingDevice> = {}): WaitingDevice => ({
  id: 'd1',
  email: 'buyer@example.ru',
  model: 'iPhone 15 Pro',
  family: 'iphone',
  udid: '00008110-001A2B3C4D5E6F70',
  reason: 'new',
  since: new Date(NOW.getTime() - 3 * 3600_000).toISOString(),
  overdue: false,
  ...over,
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('WaitingDevices', () => {
  it('shows email, model, full UDID, reason and wait time', () => {
    render(<WaitingDevices devices={[device()]} now={NOW} />);
    const row = screen.getByRole('row', { name: /buyer@example\.ru/ });
    expect(within(row).getByText('iPhone 15 Pro')).toBeInTheDocument();
    expect(within(row).getByText('00008110-001A2B3C4D5E6F70')).toBeInTheDocument();
    expect(within(row).getByText('Новое')).toBeInTheDocument();
    expect(within(row).getByText('ждёт 3 ч')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Загрузить сертификат' })).toHaveAttribute(
      'href',
      '/admin/devices/d1',
    );
  });

  it('highlights a wait over 24 hours', () => {
    render(
      <WaitingDevices
        devices={[
          device({
            overdue: true,
            since: new Date(NOW.getTime() - 25 * 3600_000).toISOString(),
          }),
        ]}
        now={NOW}
      />,
    );
    expect(screen.getByText('ждёт 1 дн. 1 ч')).toHaveAttribute('data-tone', 'err');
  });

  it.each([
    ['revoked', 'Отозван'],
    ['expired', 'Истёк'],
    ['deleted', 'Удалён'],
  ] as const)('reason %s', (reason, label) => {
    render(<WaitingDevices devices={[device({ reason })]} now={NOW} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('expiring files show days left', () => {
    render(
      <WaitingDevices
        devices={[
          device({
            reason: 'expiring',
            expiresAt: new Date(NOW.getTime() + 5 * 24 * 3600_000).toISOString(),
          }),
        ]}
        now={NOW}
      />,
    );
    expect(screen.getByText('Истекает через 5 дн.')).toBeInTheDocument();
  });

  it('copies the UDID and says so for 2 seconds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    vi.useFakeTimers();
    render(<WaitingDevices devices={[device()]} now={NOW} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Скопировать UDID' }));
    });
    expect(writeText).toHaveBeenCalledWith('00008110-001A2B3C4D5E6F70');
    expect(screen.getByRole('button', { name: 'Скопировать UDID' })).toHaveTextContent(
      'Скопировано',
    );
    await act(async () => {
      vi.advanceTimersByTime(2_100);
    });
    expect(screen.getByRole('button', { name: 'Скопировать UDID' })).toHaveTextContent(
      'Скопировать',
    );
  });

  it('empty list', () => {
    render(<WaitingDevices devices={[]} now={NOW} />);
    expect(screen.getByText('Все устройства готовы.')).toBeInTheDocument();
  });
});
