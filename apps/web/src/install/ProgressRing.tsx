import styles from './InstallButton.module.css';

const R = 22;
const C = 2 * Math.PI * R;

/**
 * The ring inside the round install button. Adapted from Magic UI «Animated Circular Progress
 * Bar» (https://magicui.design/docs/components/animated-circular-progress-bar, MIT): an SVG
 * track and arc whose dash offset follows `percent`; here the arc eases over `durationMs`
 * towards each stage's target, on Xstore tokens, without numbers inside.
 */
export function ProgressRing({
  percent,
  durationMs,
  done,
}: {
  percent: number;
  durationMs: number;
  done: boolean;
}) {
  return (
    <svg className={styles.ring} viewBox="0 0 52 52" aria-hidden="true" focusable="false">
      <circle className={styles.track} cx="26" cy="26" r={R} />
      <circle
        className={styles.arc}
        cx="26"
        cy="26"
        r={R}
        strokeDasharray={C}
        strokeDashoffset={C * (1 - Math.min(100, Math.max(0, percent)) / 100)}
        style={{ transitionDuration: `${durationMs}ms` }}
        data-percent={Math.round(percent)}
      />
      {done ? (
        <path className={styles.check} d="M17.5 26.5l6 6 11-12" />
      ) : (
        <rect className={styles.stop} x="22" y="22" width="8" height="8" rx="2" />
      )}
    </svg>
  );
}
