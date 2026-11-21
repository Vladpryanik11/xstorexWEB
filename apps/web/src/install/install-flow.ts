import {
  ErrorCode,
  errorMessages,
  type InstallStage,
  stageProgress,
  stageText,
} from '@xstore/shared';

/**
 * The «Установить» button after a tap (spec Н4 §4): ask the server, follow the signing by its
 * stages, open the one-time `itms-services://` link. Pure, so the component stays thin.
 */
export type InstallFlow =
  | { kind: 'idle' }
  /** A single-app profile: this app replaces `previous` on the iPhone. */
  | { kind: 'confirm'; previous: string }
  | { kind: 'working'; jobId: string; stage: InstallStage }
  /**
   * The link is open; iOS asks «Установить?». `itmsUrl` stays for a second tap while it is fresh
   * (`at`: when it was issued); a later tap asks for a new link for the same `jobId`.
   */
  | { kind: 'opened'; jobId: string; itmsUrl: string; at: number }
  /** Back in Safari after the iPhone window: iOS draws the download on the icon itself. */
  | { kind: 'installed'; jobId: string; itmsUrl: string; at: number }
  | { kind: 'failed'; message: string };

export type InstallEvent =
  | { type: 'start' }
  | { type: 'replaces'; previous: string }
  | { type: 'stage'; jobId: string; stage: InstallStage; errorCode?: string }
  | { type: 'link'; jobId: string; itmsUrl: string; at: number }
  | { type: 'back' }
  | { type: 'fail'; message: string }
  | { type: 'cancel' };

/** Worker refusals the buyer can act on; anything else is the generic «Не получилось…». */
const REFUSALS = new Set<string>([
  ErrorCode.DEVICE_NOT_READY,
  ErrorCode.APP_NOT_AVAILABLE,
  ErrorCode.WRONG_DEVICE,
  ErrorCode.NO_ACCESS,
]);
const failedText = (code?: string): string =>
  code && REFUSALS.has(code) ? errorMessages[code as ErrorCode] : stageText.failed;

const ORDER: InstallStage[] = ['queued', 'downloading', 'signing', 'uploading', 'ready'];

export function installReducer(state: InstallFlow, event: InstallEvent): InstallFlow {
  switch (event.type) {
    case 'start':
      return { kind: 'working', jobId: '', stage: 'queued' };
    case 'replaces':
      return { kind: 'confirm', previous: event.previous };
    case 'stage': {
      if (event.stage === 'failed') return { kind: 'failed', message: failedText(event.errorCode) };
      // Polls can answer out of order: the ring never goes back.
      if (state.kind === 'working' && ORDER.indexOf(event.stage) < ORDER.indexOf(state.stage)) {
        return { ...state, jobId: event.jobId };
      }
      return { kind: 'working', jobId: event.jobId, stage: event.stage };
    }
    case 'link':
      return { kind: 'opened', jobId: event.jobId, itmsUrl: event.itmsUrl, at: event.at };
    case 'back':
      return state.kind === 'opened' ? { ...state, kind: 'installed' } : state;
    case 'fail':
      return { kind: 'failed', message: event.message };
    case 'cancel':
      return { kind: 'idle' };
  }
}

/**
 * Where the ring heads during a stage and how long it takes to get there: it creeps towards the
 * stage's upper bound and stops just short of it until the next stage arrives (no numbers).
 */
const CREEP_MS: Record<InstallStage, number> = {
  queued: 1500,
  downloading: 8000,
  signing: 45_000,
  uploading: 8000,
  ready: 400,
  failed: 0,
};

export function ringTarget(stage: InstallStage): { percent: number; durationMs: number } {
  const { from, to } = stageProgress(stage);
  if (stage === 'ready') return { percent: 100, durationMs: CREEP_MS.ready };
  return { percent: from + (to - from) * 0.9, durationMs: CREEP_MS[stage] };
}

/** The line under the button. */
export function flowText(state: InstallFlow): string | null {
  switch (state.kind) {
    case 'idle':
      return null;
    case 'confirm':
      return `Это приложение заменит «${state.previous}» на iPhone`;
    case 'working':
      return stageText[state.stage];
    case 'opened':
      return 'Нажмите «Установить» в окне iPhone';
    case 'installed':
      return 'Установлено. Приложение появится на экране «Домой»';
    case 'failed':
      return state.message;
  }
}

/** Milliseconds between polls of the signing job. */
export const POLL_MS = 1000;
/** Polls that may fail in a row (a weak signal) before the button gives up. */
export const POLL_TOLERANCE = 3;
/**
 * A link is reused for a second tap only this long: the API serves its manifest again for 120 s
 * after the first fetch (spec Н4 §5), so an older tap takes a new link.
 */
export const LINK_FRESH_MS = 100_000;
/** With no return to Safari noticed, «Установлено» shows after this long. */
export const BACK_AFTER_MS = 10_000;
