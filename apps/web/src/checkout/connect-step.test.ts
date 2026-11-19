import { type AccessState, errorMessages } from '@xstore/shared';
import { describe, expect, it } from 'vitest';
import {
  browserFamily,
  CONNECT_POLL_INTERVAL_MS,
  CONNECT_POLL_LIMIT_MS,
  connectErrorText,
  connectStep,
  isConnectError,
} from './connect-step';

const until = new Date('2026-12-18T10:00:00Z');
const active = (device: { ready: boolean; needsHelp?: boolean } | null = null): AccessState => ({
  kind: 'active',
  until,
  subscriptionId: 's1',
  device: device
    ? {
        model: 'iPhone 15',
        family: 'iphone',
        ready: device.ready,
        needsHelp: device.needsHelp ?? false,
      }
    : null,
});
const base = { device: 'ios' as const, access: active(), result: null, waiting: false };

describe('connectStep', () => {
  it('no session → signin', () => {
    expect(connectStep({ ...base, access: { kind: 'none' }, signedIn: false })).toBe('signin');
  });

  it('signed in without access → no_access', () => {
    expect(connectStep({ ...base, access: { kind: 'none' } })).toBe('no_access');
    expect(connectStep({ ...base, access: { kind: 'payment_pending', orderId: 'o' } })).toBe(
      'no_access',
    );
  });

  it('iPhone without a device → guide', () => {
    expect(connectStep(base)).toBe('guide');
  });

  it('computer without a device → open_on_phone', () => {
    expect(connectStep({ ...base, device: 'desktop' })).toBe('open_on_phone');
  });

  it('after «Подключить iPhone» → waiting', () => {
    expect(connectStep({ ...base, waiting: true })).toBe('waiting');
  });

  it('return without callback shows hint', () => {
    // Back in Safari, iOS has not answered yet: still waiting (with the hint), never an error.
    expect(connectStep({ ...base, waiting: true, result: null })).toBe('waiting');
  });

  it('?r=connected → connected, even before the access shows the device', () => {
    expect(connectStep({ ...base, result: 'connected' })).toBe('connected');
    expect(connectStep({ ...base, access: active({ ready: false }), result: 'connected' })).toBe(
      'connected',
    );
  });

  it('the device appeared while waiting → connected', () => {
    expect(connectStep({ ...base, access: active({ ready: false }), waiting: true })).toBe(
      'connected',
    );
  });

  it('a device that needs a hand → help, whatever the page was opened with', () => {
    const access = active({ ready: false, needsHelp: true });
    expect(connectStep({ ...base, access })).toBe('help');
    expect(connectStep({ ...base, access, waiting: true })).toBe('help');
    expect(connectStep({ ...base, access, result: 'connected' })).toBe('help');
    expect(connectStep({ ...base, access, result: 'DEVICE_LIMIT' })).toBe('help');
    expect(connectStep({ ...base, device: 'desktop', access })).toBe('help');
  });

  it('a device being prepared → preparing; a registered one → ready', () => {
    expect(connectStep({ ...base, access: active({ ready: false }) })).toBe('preparing');
    expect(connectStep({ ...base, device: 'desktop', access: active({ ready: false }) })).toBe(
      'preparing',
    );
    expect(connectStep({ ...base, access: active({ ready: true }) })).toBe('ready');
    expect(connectStep({ ...base, access: active({ ready: true }), result: 'connected' })).toBe(
      'ready',
    );
  });

  it('?r=<error code> → error', () => {
    for (const code of [
      'ENROLLMENT_EXPIRED',
      'ENROLLMENT_FAILED',
      'DEVICE_OWNED',
      'DEVICE_LIMIT',
      'ENROLLMENT_UNAVAILABLE',
    ]) {
      expect(connectStep({ ...base, result: code })).toBe('error');
    }
  });

  it('a device on the access wins over a stale ?r=<error>', () => {
    expect(connectStep({ ...base, access: active({ ready: false }), result: 'DEVICE_LIMIT' })).toBe(
      'preparing',
    );
    expect(connectStep({ ...base, access: active({ ready: true }), result: 'DEVICE_OWNED' })).toBe(
      'ready',
    );
  });

  it('a new or unknown code still shows the error screen', () => {
    expect(connectStep({ ...base, result: 'SOMETHING_NEW' })).toBe('error');
    expect(connectStep({ ...base, result: 'RATE_LIMITED' })).toBe('error');
  });

  it('?r=NO_ACCESS without access → no_access, which offers to pay', () => {
    expect(connectStep({ ...base, access: { kind: 'none' }, result: 'NO_ACCESS' })).toBe(
      'no_access',
    );
  });

  it('a ?r= that is not code-shaped is ignored', () => {
    expect(connectStep({ ...base, result: '<script>' })).toBe('guide');
    expect(connectStep({ ...base, result: '' })).toBe('guide');
  });
});

describe('connectErrorText', () => {
  it('the text from errors.ts for a known code, a generic one otherwise', () => {
    expect(connectErrorText('DEVICE_OWNED')).toBe(errorMessages.DEVICE_OWNED);
    expect(connectErrorText('ENROLLMENT_UNAVAILABLE')).toBe(errorMessages.ENROLLMENT_UNAVAILABLE);
    expect(connectErrorText('SOMETHING_NEW')).toBe(
      'Не получилось подключить устройство. Попробуйте ещё раз.',
    );
  });

  it('only code-shaped values are errors', () => {
    expect(isConnectError('DEVICE_OWNED')).toBe(true);
    expect(isConnectError('connected')).toBe(false);
    expect(isConnectError('<b>x</b>')).toBe(false);
    expect(isConnectError(null)).toBe(false);
  });
});

describe('browserFamily', () => {
  it('iPad by the user agent, or a «Mac» with touch', () => {
    expect(browserFamily('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 5)).toBe('ipad');
    expect(browserFamily('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ipad');
    expect(browserFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(
      'iphone',
    );
  });
});

describe('polling', () => {
  it('every 3 seconds for up to 15 minutes', () => {
    expect(CONNECT_POLL_INTERVAL_MS).toBe(3000);
    expect(CONNECT_POLL_LIMIT_MS).toBe(15 * 60 * 1000);
  });
});
