import { type AccessState, type DeviceFamily, errorMessages } from '@xstore/shared';
import type { DeviceKind } from '../app-page/device';

export type ConnectStepState =
  | 'signin'
  | 'no_access'
  | 'guide'
  | 'waiting'
  | 'connected'
  | 'preparing'
  | 'help'
  | 'ready'
  | 'open_on_phone'
  | 'open_in_safari'
  | 'error';

/** «Ждём подключения…»: ask the API every 3 seconds, for as long as the downloaded file lives. */
export const CONNECT_POLL_INTERVAL_MS = 3000;
export const CONNECT_POLL_LIMIT_MS = 15 * 60 * 1000;

/** Session storage key: when «Подключить iPhone» was pressed, so a reload keeps waiting. */
export const CONNECT_WAITING_STORAGE = 'xstore.connectWaitingSince';

/** `?r=` error codes look like `DEVICE_OWNED`; anything else in `?r=` is ignored. */
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

/** True for `?r=<error code>`: any code-shaped value, so a code added later still shows an error. */
export function isConnectError(result: string | null): result is string {
  return result !== null && result !== 'connected' && CODE.test(result);
}

const GENERIC_ERROR = 'Не получилось подключить устройство. Попробуйте ещё раз.';

/** The text from `errors.ts` for the code, or a generic one; the raw value is never shown. */
export function connectErrorText(code: string): string {
  const messages: Record<string, string> = errorMessages;
  return Object.hasOwn(messages, code) ? (messages[code] ?? GENERIC_ERROR) : GENERIC_ERROR;
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
  /** False in another browser or an app's browser on iPhone/iPad (spec v2 §4 step 2a). */
  inSafari?: boolean;
}): ConnectStepState {
  const { device, access, result, waiting, signedIn = true, inSafari = true } = input;
  if (!signedIn) return 'signin';
  if (access.kind !== 'active') return 'no_access';
  // A device on the access is the truth: a stale `?r=<error>` (history, bookmark) is ignored.
  if (access.device?.ready) return 'ready';
  // Registration stopped: only support moves it on, as «Мой доступ» says.
  if (access.device?.needsHelp) return 'help';
  if (access.device) return waiting || result === 'connected' ? 'connected' : 'preparing';
  if (isConnectError(result)) return 'error';
  if (result === 'connected') return 'connected';
  if (device === 'desktop') return 'open_on_phone';
  // Only Safari downloads the connection file.
  if (!inSafari) return 'open_in_safari';
  return waiting ? 'waiting' : 'guide';
}

/** iPad or iPhone before a device is connected: iPadOS presents itself as a Mac with touch. */
export function browserFamily(userAgent: string, maxTouchPoints: number): DeviceFamily {
  if (/iPad/.test(userAgent)) return 'ipad';
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1 ? 'ipad' : 'iphone';
}

/** «iPhone» or «iPad» in every text of the step. */
export const familyName = (family: DeviceFamily): string => (family === 'ipad' ? 'iPad' : 'iPhone');
