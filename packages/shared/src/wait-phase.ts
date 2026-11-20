const HOUR_MS = 3600_000;
/** Spec §4.1 of the supplier certificates design: «обычно до 24 часов». */
export const WAIT_LIMIT_HOURS = 24;
/** From here on the buyer sees «Почти готово». */
export const WAIT_ALMOST_HOURS = 20;

export type WaitPhase = {
  readyBy: Date;
  phase: 'preparing' | 'almost' | 'late';
  /** Whole hours left until `readyBy`, rounded up; 0 once late. */
  hoursLeft: number;
  /** 0..1 of the 24-hour wait, for the progress bar. */
  progress: number;
};

/** Where a device waiting for its files stands, counted from `since` (connect or files ended). */
export function waitPhase(since: Date, now: Date): WaitPhase {
  const elapsed = now.getTime() - since.getTime();
  const limit = WAIT_LIMIT_HOURS * HOUR_MS;
  const readyBy = new Date(since.getTime() + limit);
  const phase =
    elapsed > limit ? 'late' : elapsed >= WAIT_ALMOST_HOURS * HOUR_MS ? 'almost' : 'preparing';
  return {
    readyBy,
    phase,
    hoursLeft: Math.max(0, Math.ceil((limit - elapsed) / HOUR_MS)),
    progress: Math.min(1, Math.max(0, elapsed / limit)),
  };
}
