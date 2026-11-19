import type { AccessState } from '@xstore/shared';
import { describe, expect, it } from 'vitest';
import { type InstallCtx, installButtonState } from './install-button-state';

const app = (slug = 'tg'): InstallCtx['app'] => ({ slug, latestVersion: { encrypted: false } });
const NONE: AccessState = { kind: 'none' };
const PENDING: AccessState = { kind: 'payment_pending', orderId: 'ord_7' };
const ACTIVE: AccessState = {
  kind: 'active',
  until: new Date('2026-12-18T10:00:00Z'),
  subscriptionId: 'sub_1',
  device: null,
};

describe('installButtonState', () => {
  it('iPhone without access: «Установить» opens the wizard, «Войти» returns to the window', () => {
    expect(installButtonState({ device: 'ios', access: NONE, app: app() })).toEqual({
      kind: 'buy',
      label: 'Установить',
      href: '/get?app=tg',
      signinHref: '/signin?next=%2F%3Fapp%3Dtg',
    });
  });

  it('encodes the slug in both links', () => {
    const state = installButtonState({ device: 'ios', access: NONE, app: app('a b') });
    expect(state.href).toBe('/get?app=a%20b');
    expect(state.signinHref).toBe('/signin?next=%2F%3Fapp%3Da%2520b');
  });

  it('an unresolved payment continues that order, on any device', () => {
    for (const device of ['ios', 'desktop'] as const) {
      expect(installButtonState({ device, access: PENDING, app: app() })).toEqual({
        kind: 'resume',
        label: 'Продолжить оплату',
        href: '/get/ord_7',
      });
    }
  });

  it('a subscriber waits for installs: the button is inactive until they ship', () => {
    for (const device of ['ios', 'desktop'] as const) {
      expect(installButtonState({ device, access: ACTIVE, app: app() })).toEqual({
        kind: 'soon',
        label: 'Скоро можно будет установить',
      });
    }
  });

  it('a computer without access offers «Оформить доступ» and sign-in', () => {
    expect(installButtonState({ device: 'desktop', access: NONE, app: app() })).toEqual({
      kind: 'desktop',
      label: 'Оформить доступ',
      href: '/get?app=tg',
      signinHref: '/signin?next=%2F%3Fapp%3Dtg',
    });
  });

  it('an app without a published version is unavailable whatever the access', () => {
    for (const access of [NONE, PENDING, ACTIVE]) {
      expect(
        installButtonState({ device: 'ios', access, app: { ...app(), latestVersion: null } }),
      ).toEqual({ kind: 'unavailable', label: 'Скоро' });
    }
  });
});
