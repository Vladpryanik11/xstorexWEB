import { describe, expect, it } from 'vitest';
import { type InstallCtx, installButtonState } from './install-button-state';

const app = (slug = 'tg'): InstallCtx['app'] => ({
  slug,
  accessLevel: 'free',
  latestVersion: { encrypted: false },
});

describe('installButtonState', () => {
  it('guests see «Установить» leading to payment, with sign-in as a second action', () => {
    expect(installButtonState({ signedIn: false, app: app() })).toEqual({
      kind: 'buy',
      label: 'Установить',
      href: '/pricing?app=tg',
      signinHref: '/signin?next=%2Fapp%2Ftg',
    });
  });

  it('encodes the slug in both links', () => {
    const state = installButtonState({ signedIn: false, app: app('a b') });
    expect(state.href).toBe('/pricing?app=a%20b');
    expect(state.signinHref).toBe('/signin?next=%2Fapp%2Fa%2520b');
  });

  it('signed-in visitors see «Скоро» until installs ship', () => {
    expect(installButtonState({ signedIn: true, app: app() })).toEqual({
      kind: 'unavailable',
      label: 'Скоро',
    });
  });

  it('an app without a published version is unavailable even for guests', () => {
    expect(installButtonState({ signedIn: false, app: { ...app(), latestVersion: null } })).toEqual(
      { kind: 'unavailable', label: 'Скоро' },
    );
  });
});
