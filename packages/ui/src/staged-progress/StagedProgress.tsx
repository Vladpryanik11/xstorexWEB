import type { CSSProperties } from 'react';
import styles from './StagedProgress.module.css';

/** Stages of putting an app on the iPhone (spec 2026-11-17 §7). */
export const SIGNING_STAGES = [
  'Регистрация устройства',
  'Подпись',
  'Загрузка',
  'Установка',
] as const;

export type StagedProgressProps = {
  stages: readonly string[];
  /** Overall progress, 0–100. */
  value: number;
  className?: string;
};

/**
 * One bar split into stages, adapted from 21st.dev «Staged Progress Bar» by dhxwhy
 * (https://21st.dev/@dhxwhy/components/staged-progress-bar).
 */
export function StagedProgress({ stages, value, className }: StagedProgressProps) {
  const pct = Math.round(Math.min(100, Math.max(0, value)));
  const share = 100 / stages.length;
  const current = Math.min(stages.length - 1, Math.floor(pct / share));
  const label = stages[current] ?? '';

  return (
    <div className={className ? `${styles.root} ${className}` : styles.root}>
      <div className={styles.caption}>
        <span className={styles.stage}>{label}</span>
        <span className={styles.pct} aria-hidden="true">
          {pct}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${label}, ${pct}%`}
        className={styles.track}
      >
        {stages.map((stage, i) => {
          const fill = Math.min(1, Math.max(0, (pct - i * share) / share));
          return (
            <span
              key={stage}
              className={styles.segment}
              data-state={fill >= 1 ? 'done' : i === current ? 'current' : 'todo'}
              style={{ '--fill': fill } as CSSProperties}
            />
          );
        })}
      </div>
    </div>
  );
}
