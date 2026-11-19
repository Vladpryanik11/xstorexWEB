import { act, fireEvent, render, screen } from '@testing-library/react';
import { type AccessResponse, type AccessState, errorMessages } from '@xstore/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectStep } from './ConnectStep';
import { CONNECT_WAITING_STORAGE } from './connect-step';

const until = new Date('2026-12-18T10:00:00Z');
const noDevice: AccessState = { kind: 'active', until, subscriptionId: 's1', device: null };
const withDevice = (ready = false): AccessState => ({
  kind: 'active',
  until,
  subscriptionId: 's1',
  device: { model: 'iPhone 15', family: 'iphone', ready, needsHelp: false },
});
const response = (state: AccessState): AccessResponse => ({
  state,
  email: 'buyer@example.com',
  hasPassword: true,
});

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

function connect() {
  fireEvent.click(screen.getByRole('link', { name: 'Подключить iPhone' }));
}

describe('ConnectStep', () => {
  it('iPhone: three pictures with captions and the connect link', () => {
    render(
      <ConnectStep
        access={noDevice}
        result={null}
        device="ios"
        family="iphone"
        getAccess={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Подключить iPhone' })).toBeInTheDocument();
    expect(screen.getByText('Нажмите «Подключить iPhone» и «Разрешить»')).toBeInTheDocument();
    expect(screen.getByText('Откройте Настройки → «Профиль загружен»')).toBeInTheDocument();
    expect(screen.getByText('Нажмите «Установить» и вернитесь в Safari')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Подключить iPhone' })).toHaveAttribute(
      'href',
      '/api/v1/enrollment/profile',
    );
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('iPhone');
  });

  it('on iPad says «iPad»', () => {
    render(
      <ConnectStep
        access={noDevice}
        result={null}
        device="ios"
        family="ipad"
        getAccess={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Подключить iPad' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Подключить iPad' })).toBeInTheDocument();
    expect(screen.getByText('Нажмите «Подключить iPad» и «Разрешить»')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('iPad');
    expect(screen.queryByText(/iPhone/)).toBeNull();
  });

  it('on a computer: the notice and no connect button', () => {
    render(<ConnectStep access={noDevice} result={null} device="desktop" getAccess={vi.fn()} />);
    expect(
      screen.getByRole('heading', { name: 'Откройте сайт на iPhone, чтобы подключить его' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Подключить/ })).toBeNull();
    expect(screen.queryByRole('img', { name: /QR/ })).toBeNull();
  });

  it('DEVICE_OWNED shows the text from errors.ts and «Попробовать снова»', () => {
    render(
      <ConnectStep access={noDevice} result="DEVICE_OWNED" device="ios" getAccess={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(errorMessages.DEVICE_OWNED);
    expect(screen.getByRole('link', { name: 'Попробовать снова' })).toHaveAttribute(
      'href',
      '/get/iphone',
    );
  });

  it('a device that needs a hand: «Нужна помощь поддержки» with a link to support', () => {
    const access: AccessState = {
      kind: 'active',
      until,
      subscriptionId: 's1',
      device: { model: 'iPad Air', family: 'ipad', ready: false, needsHelp: true },
    };
    const { container } = render(
      <ConnectStep access={access} result="connected" device="ios" getAccess={vi.fn()} />,
    );
    expect(screen.getByRole('heading', { name: 'Нужна помощь поддержки' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Написать в поддержку' })).toHaveAttribute(
      'href',
      '/support',
    );
    expect(screen.getByTestId('connect-status')).toHaveTextContent('Нужна помощь поддержки');
    expect(container.textContent).toContain('iPad');
    expect(container.textContent).not.toMatch(/Готовим|аккаунт|UDID|профил|сертификат|блок/i);
  });

  it('?r=connected: «Готово, iPhone подключён», then «Готовим ваш iPhone»', () => {
    render(
      <ConnectStep access={withDevice()} result="connected" device="ios" getAccess={vi.fn()} />,
    );
    expect(screen.getByRole('heading', { name: 'Готово, iPhone подключён' })).toBeInTheDocument();
    expect(screen.getByText('Готовим ваш iPhone, обычно до 24 часов')).toBeInTheDocument();
  });

  it('a device being prepared, seen later', () => {
    render(<ConnectStep access={withDevice()} result={null} device="ios" getAccess={vi.fn()} />);
    expect(
      screen.getByRole('heading', { name: 'Готовим ваш iPhone, обычно до 24 часов' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Подключить/ })).toBeNull();
  });

  it('without access: «Оформить доступ» on /get', () => {
    render(
      <ConnectStep access={{ kind: 'none' }} result={null} device="ios" getAccess={vi.fn()} />,
    );
    expect(screen.getByRole('link', { name: 'Оформить доступ' })).toHaveAttribute('href', '/get');
    expect(screen.queryByRole('link', { name: /Подключить/ })).toBeNull();
  });

  it('after the press: «Ждём подключения…» and the hint to return to Safari', async () => {
    const getAccess = vi.fn().mockResolvedValue(response(noDevice));
    render(
      <ConnectStep
        access={noDevice}
        result={null}
        device="ios"
        profileUrl="#connect"
        getAccess={getAccess}
      />,
    );
    connect();
    expect(screen.getByRole('heading', { name: 'Ждём подключения…' })).toBeInTheDocument();
    expect(screen.getByText('Вернитесь в Safari, когда нажмёте «Установить»')).toBeInTheDocument();
    expect(screen.getByTestId('connect-status')).toHaveTextContent('Ждём подключения…');
  });

  it('polls every 3 seconds and stops once the device appears', async () => {
    const getAccess = vi
      .fn()
      .mockResolvedValueOnce(response(noDevice))
      .mockResolvedValue(response(withDevice()));
    render(
      <ConnectStep
        access={noDevice}
        result={null}
        device="ios"
        profileUrl="#connect"
        getAccess={getAccess}
      />,
    );
    connect();
    await tick(3000);
    expect(getAccess).toHaveBeenCalledTimes(1);
    await tick(3000);
    expect(getAccess).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: 'Готово, iPhone подключён' })).toBeInTheDocument();
    await tick(30_000);
    expect(getAccess).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(CONNECT_WAITING_STORAGE)).toBeNull();
  });

  it('stops polling after 15 minutes and offers to connect again', async () => {
    const getAccess = vi.fn().mockResolvedValue(response(noDevice));
    render(
      <ConnectStep
        access={noDevice}
        result={null}
        device="ios"
        profileUrl="#connect"
        getAccess={getAccess}
      />,
    );
    connect();
    await tick(15 * 60 * 1000);
    const calls = getAccess.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(300);
    expect(calls).toBeGreaterThanOrEqual(290);
    await tick(60_000);
    expect(getAccess).toHaveBeenCalledTimes(calls);
    expect(screen.queryByRole('heading', { name: 'Ждём подключения…' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Подключить iPhone' })).toBeInTheDocument();
    expect(screen.getByText(/не завершилось/)).toBeInTheDocument();
  });

  it('a reload while waiting keeps waiting', async () => {
    sessionStorage.setItem(CONNECT_WAITING_STORAGE, String(Date.now()));
    const getAccess = vi.fn().mockResolvedValue(response(noDevice));
    render(<ConnectStep access={noDevice} result={null} device="ios" getAccess={getAccess} />);
    await tick(0);
    expect(screen.getByRole('heading', { name: 'Ждём подключения…' })).toBeInTheDocument();
  });

  it('an old waiting mark (over 15 minutes) is dropped', async () => {
    sessionStorage.setItem(CONNECT_WAITING_STORAGE, String(Date.now() - 16 * 60 * 1000));
    render(<ConnectStep access={noDevice} result={null} device="ios" getAccess={vi.fn()} />);
    await tick(0);
    expect(screen.getByRole('heading', { name: 'Подключить iPhone' })).toBeInTheDocument();
  });

  it('a session lost while waiting sends the buyer to sign in', async () => {
    const getAccess = vi.fn().mockResolvedValue({ state: { kind: 'none' } });
    const navigate = vi.fn();
    render(
      <ConnectStep
        access={noDevice}
        result={null}
        device="ios"
        profileUrl="#connect"
        getAccess={getAccess}
        navigate={navigate}
      />,
    );
    connect();
    await tick(3000);
    expect(navigate).toHaveBeenCalledWith('/signin?next=/get/iphone');
    expect(screen.queryByRole('heading', { name: 'Сначала оформите доступ' })).toBeNull();
    await tick(30_000);
    expect(getAccess).toHaveBeenCalledTimes(1);
  });

  it('a new error code shows a generic text and «Попробовать снова»', () => {
    render(
      <ConnectStep access={noDevice} result="SOMETHING_NEW" device="ios" getAccess={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не получилось подключить устройство. Попробуйте ещё раз.',
    );
    expect(screen.getByRole('link', { name: 'Попробовать снова' })).toBeInTheDocument();
  });

  it('a stale ?r=<error> with a device shows the device state', () => {
    render(
      <ConnectStep access={withDevice()} result="DEVICE_LIMIT" device="ios" getAccess={vi.fn()} />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Готовим ваш iPhone, обычно до 24 часов' }),
    ).toBeInTheDocument();
  });

  it('switching to waiting scrolls to the top', () => {
    const scrollTo = vi.fn();
    Object.defineProperty(document.documentElement, 'scrollTo', {
      value: scrollTo,
      configurable: true,
    });
    render(
      <ConnectStep
        access={noDevice}
        result={null}
        device="ios"
        profileUrl="#connect"
        getAccess={vi.fn().mockResolvedValue(response(noDevice))}
      />,
    );
    connect();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    delete (document.documentElement as { scrollTo?: unknown }).scrollTo;
  });
});
