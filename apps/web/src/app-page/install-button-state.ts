import type { AccessState } from '@xstore/shared';
import type { DeviceKind } from './device';

/**
 * What the button in the app window shows (spec v2 §3.2). Н1 knows payment only: without access
 * the window leads to the wizard, an unpaid order continues, and a subscriber waits for installs
 * (`soon`) until Н2–Н4 add connecting the iPhone and installing.
 */
export type InstallCtx = {
  device: DeviceKind;
  access: AccessState;
  app: {
    slug: string;
    latestVersion: { encrypted: boolean } | null;
  };
};

export type InstallState = {
  kind: 'buy' | 'resume' | 'soon' | 'desktop' | 'unavailable';
  label: string;
  href?: string;
  /** Second action for visitors who have already paid; returns to the same window. */
  signinHref?: string;
};

export function installButtonState({ device, access, app }: InstallCtx): InstallState {
  if (!app.latestVersion) return { kind: 'unavailable', label: 'Скоро' };
  if (access.kind === 'payment_pending') {
    return {
      kind: 'resume',
      label: 'Продолжить оплату',
      href: `/get/${encodeURIComponent(access.orderId)}`,
    };
  }
  if (access.kind === 'active') return { kind: 'soon', label: 'Скоро можно будет установить' };
  const slug = encodeURIComponent(app.slug);
  return {
    kind: device === 'ios' ? 'buy' : 'desktop',
    label: device === 'ios' ? 'Установить' : 'Оформить доступ',
    href: `/get?app=${slug}`,
    signinHref: `/signin?next=${encodeURIComponent(`/?app=${slug}`)}`,
  };
}
