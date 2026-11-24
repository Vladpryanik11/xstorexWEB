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

/** Removed and premium apps taking turns, each app once (it can sit in both sections). */
export function mixedApps(removed: AppCard[], premium: AppCard[]): AppCard[] {
  const seen = new Set<string>();
  const out: AppCard[] = [];
  for (let i = 0; i < Math.max(removed.length, premium.length); i++) {
    for (const a of [removed[i], premium[i]]) {
      if (a && !seen.has(a.slug)) {
        seen.add(a.slug);
        out.push(a);
      }
    }
  }
  return out;
}

/** Speed of the lane, px per second. */
const SPEED = 24;

/**
 * One live lane of real catalog icons instead of the banner (spec 2026-11-23-home-first-screen
 * §3.3; owner 2026-11-24: one lane, no caption — the title and the subtitle already say «removed»
 * and «premium»). Removed and premium apps take turns, from edge to edge of the screen, no frame.
 * The lane runs endlessly to the left, stands still under reduced motion and under a mouse; an
 * icon opens its install sheet. Without apps nothing is drawn.
 */
export function HeroLanes({ removed, premium }: { removed: AppCard[]; premium: AppCard[] }) {
  const apps = laneApps(mixedApps(removed, premium), PER_LANE);
  if (apps.length === 0) return null;
  return (
    <div className={styles.lanes} data-hero-lanes="">
      <Lane lane="catalog" speed={SPEED} apps={apps} />
    </div>
  );
}

function Lane({ lane, speed, apps }: { lane: string; speed: number; apps: AppCard[] }) {
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
