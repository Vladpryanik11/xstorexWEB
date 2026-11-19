import type { AccessState, DeviceFamily, ErrorCode } from '@xstore/shared';
import type { DeviceKind } from '../app-page/device';

export type ConnectStepState =
  | 'signin'
  | 'no_access'
  | 'guide'
  | 'waiting'
  | 'connected'
  | 'preparing'
  | 'ready'
  | 'open_on_phone'
  | 'error';

/** «Ждём подключения…»: ask the API every 3 seconds, for as long as the downloaded file lives. */
export const CONNECT_POLL_INTERVAL_MS = 3000;
export const CONNECT_POLL_LIMIT_MS = 15 * 60 * 1000;

/** Session storage key: when «Подключить iPhone» was pressed, so a reload keeps waiting. */
export const CONNECT_WAITING_STORAGE = 'xstore.connectWaitingSince';

/** `?r=` codes the API callback (or a later redirect from the file link) can send back. */
const RESULT_ERRORS = [
  'ENROLLMENT_EXPIRED',
  'ENROLLMENT_FAILED',
  'ENROLLMENT_INVALID',
  'ENROLLMENT_UNAVAILABLE',
  'DEVICE_OWNED',
  'DEVICE_LIMIT',
  'NO_ACCESS',
  'RATE_LIMITED',
] as const satisfies readonly ErrorCode[];
export type ConnectErrorCode = (typeof RESULT_ERRORS)[number];

/** The error code in `?r=`, or null for `connected`, nothing, or anything unknown. */
export function connectErrorCode(result: string | null): ConnectErrorCode | null {
  return (RESULT_ERRORS as readonly string[]).includes(result ?? '')
    ? (result as ConnectErrorCode)
    : null;
}

/**
 * Which screen of wizard step 2 to show. `waiting` is true after «Подключить iPhone» was pressed
 * in this tab; while iOS has not answered, that stays «Ждём подключения…» with the hint — coming
 * back to Safari without installing is never an error.
 */
export function connectStep(input: {
  device: DeviceKind;
  access: AccessState;
  result: string | null;
  waiting: boolean;
  /** False without a buyer session; the page redirects to sign-in before rendering. */
  signedIn?: boolean;
}): ConnectStepState {
  const { device, access, result, waiting, signedIn = true } = input;
  if (!signedIn) return 'signin';
  if (access.kind !== 'active') return 'no_access';
  if (connectErrorCode(result)) return 'error';
  if (access.device?.ready) return 'ready';
  if (result === 'connected') return 'connected';
  if (access.device) return waiting ? 'connected' : 'preparing';
  if (device === 'desktop') return 'open_on_phone';
  return waiting ? 'waiting' : 'guide';
}

/** iPad or iPhone before a device is connected: iPadOS presents itself as a Mac with touch. */
export function browserFamily(userAgent: string, maxTouchPoints: number): DeviceFamily {
  if (/iPad/.test(userAgent)) return 'ipad';
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1 ? 'ipad' : 'iphone';
}

/** «iPhone» or «iPad» in every text of the step. */
export const familyName = (family: DeviceFamily): string => (family === 'ipad' ? 'iPad' : 'iPhone');
