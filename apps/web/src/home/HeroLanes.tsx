import type { AppCard } from '@xstore/shared';
import styles from './HeroLanes.module.css';

/** Icons per lane: enough to run past the right edge of a computer screen. */
const PER_LANE = 18;

/** Icon URLs of a section, repeated in order until the lane holds `count`. */
export function laneIcons(apps: AppCard[], count: number): string[] {
  const urls = apps.flatMap((a) => (a.iconUrl ? [a.iconUrl] : []));
  if (urls.length === 0) return [];
  return Array.from({ length: count }, (_, i) => urls[i % urls.length] as string);
}

const LANES = [
  { key: 'removed', caption: 'Удалены из App Store' },
  { key: 'premium', caption: 'Premium' },
] as const;

/**
 * Two lanes of real catalog icons instead of the banner (spec 2026-11-23-home-first-screen §3.3,
 * owner 2026-11-23): no frame, the lanes run from edge to edge and the screen cuts them; a caption
 * above each. A section without apps is left out. The icons are decorative.
 */
export function HeroLanes({ removed, premium }: { removed: AppCard[]; premium: AppCard[] }) {
  const apps = { removed, premium };
  const lanes = LANES.map((l) => ({ ...l, icons: laneIcons(apps[l.key], PER_LANE) })).filter(
    (l) => l.icons.length > 0,
  );
  if (lanes.length === 0) return null;
  return (
    <div className={styles.lanes} data-hero-lanes="">
      {lanes.map((l) => (
        <div key={l.key} className={styles.lane} data-hero-lane={l.key}>
          <p className={styles.caption} data-lane-caption="">
            {l.caption}
          </p>
          <div className={styles.track} aria-hidden="true" data-lane-track="">
            {l.icons.map((src, i) => (
              // biome-ignore lint/performance/noImgElement: tiny decorative icons from S3
              // biome-ignore lint/suspicious/noArrayIndexKey: icons repeat, the position is the key
              <img key={i} className={styles.icon} src={src} alt="" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
