import { act, fireEvent, render, screen } from '@testing-library/react';
import { ApiClientError, type InstallJobView, type InstallLink } from '@xstore/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  requestInstall: vi.fn<(slug: string, body?: object) => Promise<InstallJobView>>(),
  installJob: vi.fn<(id: string) => Promise<InstallJobView>>(),
  installLink: vi.fn<(id: string) => Promise<InstallLink>>(),
}));
vi.mock('../checkout/browser-api', () => ({ browserApi: () => api }));

import { InstallButton } from './InstallButton';

const LINK = { itmsUrl: 'itms-services://?action=download-manifest&url=x', expiresAt: '' };
let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  assign = vi.fn();
  vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location);
  api.installLink.mockResolvedValue(LINK);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  api.requestInstall.mockReset();
  api.installJob.mockReset();
  api.installLink.mockReset();
});

const tap = () => fireEvent.click(screen.getByRole('button', { name: 'Установить' }));
const ring = () => document.querySelector('[data-percent]');

describe('InstallButton', () => {
  it('signs by stages, fills the ring and opens the install link', async () => {
    api.requestInstall.mockResolvedValue({ jobId: 'j1', stage: 'queued' });
    api.installJob
      .mockResolvedValueOnce({ jobId: 'j1', stage: 'signing' })
      .mockResolvedValueOnce({ jobId: 'j1', stage: 'ready' });
    render(<InstallButton slug="app-1" />);
    tap();
    expect(await screen.findByText('Проверяем доступ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Установить' })).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(await screen.findByText('Подписываем сертификатом вашего iPhone')).toBeInTheDocument();
    const signing = Number(ring()?.getAttribute('data-percent'));
    expect(signing).toBeGreaterThan(30);
    expect(signing).toBeLessThan(80);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(await screen.findByText('Нажмите «Установить» в окне iPhone')).toBeInTheDocument();
    expect(api.installLink).toHaveBeenCalledWith('j1');
    expect(assign).toHaveBeenCalledWith(LINK.itmsUrl);
    expect(screen.getByRole('link', { name: 'Нажмите ещё раз' })).toHaveAttribute(
      'href',
      LINK.itmsUrl,
    );
    expect(api.requestInstall).toHaveBeenCalledWith('app-1', {});
  });

  it('a ready copy opens the link at once', async () => {
    api.requestInstall.mockResolvedValue({ jobId: 'j2', stage: 'ready' });
    render(<InstallButton slug="app-1" />);
    tap();
    expect(await screen.findByText('Нажмите «Установить» в окне iPhone')).toBeInTheDocument();
    expect(api.installJob).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(LINK.itmsUrl);
  });

  it('warns before replacing the previous app', async () => {
    api.requestInstall
      .mockRejectedValueOnce(new ApiClientError(409, 'REPLACES_APP', 'x', ['Первое']))
      .mockRejectedValueOnce(new ApiClientError(409, 'REPLACES_APP', 'x', ['Первое']))
      .mockResolvedValueOnce({ jobId: 'j3', stage: 'ready' });
    render(<InstallButton slug="app-2" />);
    tap();
    expect(
      await screen.findByText('Это приложение заменит «Первое» на iPhone'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    tap();
    fireEvent.click(await screen.findByRole('button', { name: 'Всё равно установить' }));
    await screen.findByText('Нажмите «Установить» в окне iPhone');
    expect(api.requestInstall).toHaveBeenLastCalledWith('app-2', { confirmReplace: true });
  });

  it('failure offers a retry', async () => {
    api.requestInstall.mockResolvedValue({ jobId: 'j4', stage: 'queued' });
    api.installJob.mockResolvedValue({ jobId: 'j4', stage: 'failed', errorCode: 'SIGNING_FAILED' });
    render(<InstallButton slug="app-1" />);
    tap();
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(await screen.findByText('Не получилось подготовить приложение')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeEnabled();
  });

  it('a refused request shows the server message', async () => {
    api.requestInstall.mockRejectedValue(
      new ApiClientError(
        409,
        'DEVICE_NOT_READY',
        'iPhone ещё готовится, установка будет доступна чуть позже',
      ),
    );
    render(<InstallButton slug="app-1" />);
    tap();
    expect(
      await screen.findByText('iPhone ещё готовится, установка будет доступна чуть позже'),
    ).toBeInTheDocument();
  });
});
