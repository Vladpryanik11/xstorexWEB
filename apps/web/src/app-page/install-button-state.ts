import type { AccessState, DeviceFamily } from '@xstore/shared';
import type { DeviceKind } from './device';

/**
 * What the button in the app window shows (spec v2 §3.2). Without access the window leads to the
 * wizard and an unpaid order continues. A subscriber first connects the iPhone (Н2), waits while it
 * is prepared, and then waits for installs (`soon`) until Н4 ships them.
 */
export type InstallCtx = {
  device: DeviceKind;
  /** iPhone or iPad by the browser; names the device before one is connected. */
  family?: DeviceFamily;
  access: AccessState;
  app: {
    slug: string;
    latestVersion: { encrypted: boolean } | null;
  };
};

export type InstallState = {
  kind: 'buy' | 'resume' | 'connect' | 'preparing' | 'help' | 'soon' | 'desktop' | 'unavailable';
  label: string;
  href?: string;
  /** Second action for visitors who have already paid; returns to the same window. */
  signinHref?: string;
};

const SOON: InstallState = { kind: 'soon', label: 'Скоро можно будет установить' };
const familyName = (family: DeviceFamily): string => (family === 'ipad' ? 'iPad' : 'iPhone');

function subscriberState(
  device: DeviceKind,
  family: DeviceFamily,
  access: Extract<AccessState, { kind: 'active' }>,
): InstallState {
  const bound = access.device;
  // A computer cannot connect: the window's note sends the buyer to the phone.
  if (!bound) {
    return device === 'ios'
      ? { kind: 'connect', label: `Подключить ${familyName(family)}`, href: '/get/iphone' }
      : SOON;
  }
  if (bound.ready) return SOON;
  if (bound.needsHelp) return { kind: 'help', label: 'Написать в поддержку', href: '/support' };
  return { kind: 'preparing', label: `Готовим ваш ${familyName(bound.family)}, до 24 часов` };
}

export function installButtonState({
  device,
  family = 'iphone',
  access,
  app,
}: InstallCtx): InstallState {
  if (!app.latestVersion) return { kind: 'unavailable', label: 'Скоро' };
  if (access.kind === 'payment_pending') {
    return {
      kind: 'resume',
      label: 'Продолжить оплату',
      href: `/get/${encodeURIComponent(access.orderId)}`,
    };
  }
  if (access.kind === 'active') return subscriberState(device, family, access);
  const slug = encodeURIComponent(app.slug);
  return {
    kind: device === 'ios' ? 'buy' : 'desktop',
    label: device === 'ios' ? 'Установить' : 'Оформить доступ',
    href: `/get?app=${slug}`,
    signinHref: `/signin?next=${encodeURIComponent(`/?app=${slug}`)}`,
  };
}
