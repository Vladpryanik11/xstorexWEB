import type { AccessState } from '@xstore/shared';
import { describe, expect, it } from 'vitest';
import { type InstallCtx, installButtonState } from './install-button-state';

const app = (slug = 'tg'): InstallCtx['app'] => ({ slug, latestVersion: { encrypted: false } });
const NONE: AccessState = { kind: 'none' };
const PENDING: AccessState = { kind: 'payment_pending', orderId: 'ord_7' };
const withDevice = (device: Extract<AccessState, { kind: 'active' }>['device']): AccessState => ({
  kind: 'active',
  until: new Date('2026-12-18T10:00:00Z'),
  subscriptionId: 'sub_1',
  device,
});
const ACTIVE = withDevice(null);
const iphone = (over: { ready?: boolean; needsHelp?: boolean } = {}) =>
  withDevice({ model: 'iPhone 15 Pro', family: 'iphone', ready: false, needsHelp: false, ...over });
const ipad = (over: { ready?: boolean; needsHelp?: boolean } = {}) =>
  withDevice({ model: 'iPad Air', family: 'ipad', ready: false, needsHelp: false, ...over });
const READY = iphone({ ready: true });

describe('installButtonState', () => {
  it('files ended: «Обновляем доступ, обычно до 24 часов», disabled like preparing', () => {
    const access = withDevice({
      model: 'iPhone 15 Pro',
      family: 'iphone',
      ready: false,
      needsHelp: false,
      updating: true,
    });
    expect(installButtonState({ device: 'ios', access, app: app() })).toEqual({
      kind: 'preparing',
      label: 'Обновляем доступ, обычно до 24 часов',
    });
  });

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

  it('a subscriber with a ready device waits for installs: the button is inactive', () => {
    for (const device of ['ios', 'desktop'] as const) {
      expect(installButtonState({ device, access: READY, app: app() })).toEqual({
        kind: 'soon',
        label: 'Скоро можно будет установить',
      });
    }
  });

  it('iPhone with access and no device: «Подключить iPhone» opens the connect step', () => {
    expect(installButtonState({ device: 'ios', access: ACTIVE, app: app() })).toEqual({
      kind: 'connect',
      label: 'Подключить iPhone',
      href: '/get/iphone',
    });
  });

  it('iPad with access and no device says «iPad»', () => {
    expect(
      installButtonState({ device: 'ios', family: 'ipad', access: ACTIVE, app: app() }),
    ).toEqual({ kind: 'connect', label: 'Подключить iPad', href: '/get/iphone' });
  });

  it('a computer with access and no device cannot connect from here: inactive «Скоро…»', () => {
    expect(installButtonState({ device: 'desktop', access: ACTIVE, app: app() })).toEqual({
      kind: 'soon',
      label: 'Скоро можно будет установить',
    });
  });

  it('a device being prepared: an inactive «Готовим ваш iPhone, обычно до 24 часов» everywhere', () => {
    for (const device of ['ios', 'desktop'] as const) {
      expect(installButtonState({ device, access: iphone(), app: app() })).toEqual({
        kind: 'preparing',
        label: 'Готовим ваш iPhone, обычно до 24 часов',
      });
    }
  });

  it('the connected device names itself: an iPad is prepared as «iPad» even seen from an iPhone', () => {
    for (const family of ['iphone', 'ipad'] as const) {
      expect(installButtonState({ device: 'ios', family, access: ipad(), app: app() })).toEqual({
        kind: 'preparing',
        label: 'Готовим ваш iPad, обычно до 24 часов',
      });
    }
  });

  it('a device that needs a hand leads to support, on any device', () => {
    for (const device of ['ios', 'desktop'] as const) {
      expect(
        installButtonState({ device, access: iphone({ needsHelp: true }), app: app() }),
      ).toEqual({ kind: 'help', label: 'Написать в поддержку', href: '/support' });
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
    for (const access of [NONE, PENDING, ACTIVE, READY, iphone()]) {
      expect(
        installButtonState({ device: 'ios', access, app: { ...app(), latestVersion: null } }),
      ).toEqual({ kind: 'unavailable', label: 'Скоро' });
    }
  });
});
