'use client';

import type { AppCard } from '@xstore/shared';
import Link from 'next/link';
import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import styles from './HeroLanes.module.css';

/** Icons in half a lane: enough to run past the right edge of a computer screen. */
const PER_LANE = 18;
/** One icon and its gap on a phone, px: the lane moves at this many px per second (below). */
const STEP_PX = 66;
/** A first touch stops a running lane for this long; the next touch opens the app. */
const HOLD_MS = 2000;

/** Apps of a section that have an icon, repeated in order until the lane holds `count`. */
export function laneApps(apps: AppCard[], count: number): AppCard[] {
  const withIcon = apps.filter((a) => a.iconUrl);
  if (withIcon.length === 0) return [];
  return Array.from({ length: count }, (_, i) => withIcon[i % withIcon.length] as AppCard);
}

const LANES = [
  { key: 'removed', caption: 'Удалены из App Store', speed: 24 },
  { key: 'premium', caption: 'Premium', speed: 18 },
] as const;

/**
 * Two live lanes of real catalog icons instead of the banner (spec 2026-11-23-home-first-screen
 * §3.3, owner 2026-11-23): no frame, from edge to edge of the screen, a caption above each. The
 * lanes run endlessly to the left (24 and 18 px/s), stand still under reduced motion and under a
 * mouse; an icon opens its install sheet. A section without apps is left out.
 */
export function HeroLanes({ removed, premium }: { removed: AppCard[]; premium: AppCard[] }) {
  const apps = { removed, premium };
  const lanes = LANES.map((l) => ({ ...l, apps: laneApps(apps[l.key], PER_LANE) })).filter(
    (l) => l.apps.length > 0,
  );
  if (lanes.length === 0) return null;
  return (
    <div className={styles.lanes} data-hero-lanes="">
      {lanes.map((l) => (
        <Lane key={l.key} lane={l.key} caption={l.caption} speed={l.speed} apps={l.apps} />
      ))}
    </div>
  );
}

function Lane({
  lane,
  caption,
  speed,
  apps,
}: {
  lane: string;
  caption: string;
  speed: number;
  apps: AppCard[];
}) {
  const [paused, setPaused] = useState(false);
  // Set by a touch on a running lane: the click that follows only stops it.
  const swallow = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    swallow.current = !paused;
    setPaused(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPaused(false), HOLD_MS);
  };
  const onClickCapture = (e: MouseEvent) => {
    if (!swallow.current) return;
    swallow.current = false;
    e.preventDefault();
  };

  // The first copy of each app is named for a screen reader; repeats are hidden.
  const seen = new Set<string>();
  const half = apps.map((a) => {
    const first = !seen.has(a.slug);
    seen.add(a.slug);
    return { app: a, first };
  });
  const items = [...half, ...half.map((h) => ({ ...h, first: false }))];

  return (
    <div
      className={styles.lane}
      data-hero-lane={lane}
      data-paused={paused ? '' : undefined}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
    >
      <p className={styles.caption} data-lane-caption="">
        {caption}
      </p>
      <div className={styles.view}>
        <div
          className={styles.track}
          data-lane-track=""
          style={{ '--lane-duration': `${(apps.length * STEP_PX) / speed}s` } as CSSProperties}
        >
          {items.map(({ app, first }, i) => (
            <Link
              // biome-ignore lint/suspicious/noArrayIndexKey: icons repeat, the position is the key
              key={i}
              className={styles.item}
              href={`/?app=${encodeURIComponent(app.slug)}`}
              scroll={false}
              aria-hidden={first ? undefined : true}
              tabIndex={first ? undefined : -1}
            >
              {/* biome-ignore lint/performance/noImgElement: small catalog icons from S3 */}
              <img className={styles.icon} src={app.iconUrl} alt={first ? app.name : ''} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
