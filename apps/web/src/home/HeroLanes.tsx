'use client';

import type { AppCard } from '@xstore/shared';
import Link from 'next/link';
import { type MouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react';
import styles from './HeroLanes.module.css';

/** Icons in one copy of the lane: enough to run past the right edge of a computer screen. */
const PER_LANE = 12;
/** Copies of the lane side by side: the view stays in the middle one, so the lane never ends. */
const COPIES = 3;
/** The middle icon is this much larger (owner 2026-11-24, «Заметно»). */
const MAG = 1.38;
/** The Dock effect reaches this many icons to each side of the middle. */
const REACH = 2.6;
/** Untouched for this long, the lane starts drifting. */
const IDLE_MS = 1500;
/** Drift to the left, px per second. */
const DRIFT = 25;
/** The search moves the app it found to the middle in this time. */
const CENTER_MS = 520;
/** A mouse that moved this far is dragging, not clicking. */
const DRAG_PX = 4;

/** «Уменьшение движения» in the settings of the phone or computer. */
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/**
 * Size of each icon from its distance to the middle of the lane, like the Dock of macOS: the
 * middle one is `MAG` times larger, the others smaller along a smooth curve, `REACH` icons away
 * they are back to normal.
 */
export function dockScales(distances: number[], step: number): number[] {
  const reach = step * REACH;
  return distances.map((d) => {
    const t = Math.max(0, 1 - Math.abs(d) / reach);
    return 1 + (MAG - 1) * ((1 - Math.cos(t * Math.PI)) / 2);
  });
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]/g, '');

/** How people type the names written in Latin letters. */
const SPELLINGS: Record<string, string> = {
  телеграм: 'telegram',
  телеграмм: 'telegram',
  ватсап: 'whatsapp',
  вотсап: 'whatsapp',
  инстаграм: 'instagram',
  инста: 'instagram',
  вк: 'вконтакте',
  ютуб: 'youtube',
  '2гис': '2gis',
  тикток: 'tiktok',
  окко: 'okko',
  форест: 'forest',
  рутуб: 'rutube',
};

/**
 * Every app of the lane the query names, the best first: exact names, then names that start with
 * it, then any name or address that holds it. Common spellings («телеграм») count too.
 */
export function matchApps(apps: AppCard[], query: string): string[] {
  const typed = norm(query);
  if (!typed) return [];
  const tries = [typed];
  for (const [said, written] of Object.entries(SPELLINGS)) {
    if (typed.length >= 2 && (said.startsWith(typed) || typed.startsWith(said))) {
      tries.push(norm(written));
    }
  }
  const names = apps.map((a) => ({ slug: a.slug, name: norm(a.name), path: norm(a.slug) }));
  const out: string[] = [];
  const add = (slug: string) => {
    if (!out.includes(slug)) out.push(slug);
  };
  for (const q of tries) {
    for (const a of names) if (a.name === q) add(a.slug);
    for (const a of names) if (a.name.startsWith(q)) add(a.slug);
    for (const a of names) if (a.name.includes(q) || a.path.includes(q)) add(a.slug);
  }
  return out;
}

/** The best app of the lane for the query, `null` when none fits. */
export function matchApp(apps: AppCard[], query: string): string | null {
  return matchApps(apps, query)[0] ?? null;
}

/**
 * How far each icon moves out to make room for the larger ones around the middle, like the Dock
 * of macOS. `d` is the distance of each icon from the middle of the lane, `sc` its scale, `size`
 * the icon. The icons push their neighbours out by their extra size; then the whole row is moved
 * back so that the point in the middle of the lane stays where it was. Pushing out from the
 * nearest icon instead made the lane jump by ~19 px each time the next icon became the nearest
 * (owner 2026-11-24 21:53, «дёргание, когда иконка становится большой»).
 */
export function dockShifts(d: number[], sc: number[], size: number): number[] {
  const n = d.length;
  if (n === 0) return [];
  let near = 0;
  d.forEach((v, k) => {
    if (Math.abs(v) < Math.abs(d[near] as number)) near = k;
  });
  const extra = (k: number) => size * ((sc[k] as number) - 1);
  const shift = new Array<number>(n).fill(0);
  for (let k = near + 1; k < n; k++) {
    shift[k] = (shift[k - 1] as number) + (extra(k - 1) + extra(k)) / 2;
  }
  for (let k = near - 1; k >= 0; k--) {
    shift[k] = (shift[k + 1] as number) - (extra(k + 1) + extra(k)) / 2;
  }
  // The middle of the lane lies between the nearest icon and its neighbour on the other side:
  // move everything back by the shift found there, so that point stays put.
  const dn = d[near] as number;
  const other = dn > 0 ? near - 1 : near + 1;
  let anchor = 0;
  if (dn !== 0 && other >= 0 && other < n) {
    const dOther = d[other] as number;
    anchor = ((shift[other] as number) * (0 - dn)) / (dOther - dn);
  }
  return shift.map((v) => v - anchor);
}

/**
 * One live lane of real catalog icons (spec 2026-11-23-home-first-screen §3.3, «Лента как Dock»,
 * owner 2026-11-24): removed and premium apps take turns from edge to edge of the screen. A finger
 * (or a mouse) scrolls it without an end; the icon in the middle is larger and its neighbours
 * shrink towards the edges, like the Dock of macOS; the name of the middle app is under the lane.
 * Untouched, it drifts slowly to the left; under reduced motion it stands. `focus` moves that app
 * to the middle; while searching, the apps in `found` stay bright and the others fade. An icon opens its install sheet. Without apps nothing is drawn.
 */
export function HeroLanes({
  removed,
  premium,
  focus = null,
  found = null,
  paused = false,
}: {
  removed: AppCard[];
  premium: AppCard[];
  focus?: string | null;
  /** Apps the search found in the lane; `null` while nobody searches. */
  found?: string[] | null;
  /** The search field has text: the lane does not drift. */
  paused?: boolean;
}) {
  const unique = mixedApps(removed, premium).filter((a) => a.iconUrl);
  const one = laneApps(unique, Math.max(PER_LANE, unique.length));
  if (one.length === 0) return <PlaceholderLane />;
  return (
    <div className={styles.lanes} data-hero-lanes="">
      <Lane apps={one} focus={focus} found={found} paused={paused} />
    </div>
  );
}

/**
 * Owner 2026-11-24 16:55: while the catalog is empty, a still row of glass placeholders stands in
 * for the icons, so the first screen keeps its look and height. They lead nowhere.
 */
function PlaceholderLane() {
  return (
    <div className={styles.lanes} data-lane-placeholder="" aria-hidden="true">
      <div className={styles.lane}>
        <div className={`${styles.track} ${styles.still}`}>
          {Array.from({ length: PER_LANE }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, the position is the key
            <span key={i} className={styles.item} data-ghost="">
              <span className={`${styles.icon} ${styles.ghost}`} />
            </span>
          ))}
        </div>
        <p className={styles.name} />
      </div>
    </div>
  );
}

function Lane({
  apps,
  focus,
  found,
  paused,
}: {
  apps: AppCard[];
  focus: string | null;
  found: string[] | null;
  paused: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLParagraphElement>(null);
  const live = useRef({
    touching: false,
    idle: 0,
    paused,
    focus,
    centering: false,
    drag: null as null | { x: number; left: number },
    dragged: false,
  });
  live.current.paused = paused;
  live.current.focus = focus;

  // Each app is named once for a screen reader: in the middle copy, which is the one in view.
  const seen = new Set<string>();
  const items = Array.from({ length: COPIES }, (_, c) =>
    apps.map((app) => {
      const named = c === 1 && !seen.has(app.slug);
      if (named) seen.add(app.slug);
      return { app, named };
    }),
  ).flat();

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const slots = [...el.querySelectorAll<HTMLElement>('[data-slot]')];
    const reduce = reducedMotion();
    // Layout is read once and again only on a resize: reading it every frame, right after the
    // scroll moved, made the browser lay the page out on every frame.
    let sw = 0;
    let half = 0;
    let offs: number[] = [];
    const measure = () => {
      sw = slots[0]?.offsetWidth ?? 0;
      half = el.clientWidth / 2;
      offs = slots.map((s) => s.offsetLeft + sw / 2);
    };
    measure();
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    resize?.observe(el);
    const width = () => sw * apps.length;
    const applied: string[] = [];
    /**
     * Places the icons for the lane scrolled to `pos`. The browser keeps the scroll in whole
     * pixels while the drift moves less than a pixel a frame, so the icons stood still and then
     * jumped a pixel (owner 2026-11-24 21:39 «лагает»): `nudge` moves them by the part of a pixel
     * the scroll could not, and the lane glides.
     */
    const draw = (pos: number, nudge: number) => {
      if (sw === 0) return;
      const d = offs.map((o) => o - pos - half);
      const sc = dockScales(d, sw);
      let near = 0;
      d.forEach((v, k) => {
        if (Math.abs(v) < Math.abs(d[near] as number)) near = k;
      });
      const shift = dockShifts(d, sc, sw * 0.82);
      const size = sw * 0.82;
      // Only the icons in view move by the part of a pixel; the others keep their place, so the
      // browser repaints only what is on screen.
      const view = half + sw * 2;
      slots.forEach((s, k) => {
        const lift = ((sc[k] as number) - 1) * size * 0.35;
        const x = (shift[k] as number) + (Math.abs(d[k] as number) < view ? nudge : 0);
        const next = `translate(${x}px, ${-lift}px) scale(${sc[k]})`;
        const img = s.firstElementChild as HTMLElement | null;
        if (img && applied[k] !== next) {
          img.style.transform = next;
          applied[k] = next;
        }
      });
      const middleApp = apps[near % apps.length];
      if (name.current && middleApp && name.current.textContent !== middleApp.name) {
        name.current.textContent = middleApp.name;
      }
      // The name stands right under the middle icon, which drifts off the middle of the lane.
      if (name.current) {
        name.current.style.transform = `translateX(${(d[near] ?? 0) + (shift[near] ?? 0) + nudge}px)`;
      }
    };

    let frame = 0;
    let last = performance.now();
    // The lane keeps its own exact place and follows any other scroll (a finger, the search).
    let pos = el.scrollLeft;
    const tick = (t: number) => {
      const dt = Math.min(50, t - last);
      last = t;
      const s = live.current;
      s.idle += dt;
      const drifting = !reduce && !s.touching && !s.paused && !s.centering && s.idle > IDLE_MS;
      if (drifting) {
        if (Math.abs(el.scrollLeft - pos) > 1) pos = el.scrollLeft;
        pos += (dt * DRIFT) / 1000;
        el.scrollLeft = pos;
      } else {
        pos = el.scrollLeft;
      }
      // Keep the view inside the middle copy.
      const w = width();
      if (w > 0 && (pos < w * 0.5 || pos > w * 1.5)) {
        pos += pos < w * 0.5 ? w : -w;
        el.scrollLeft = pos;
      }
      draw(pos, drifting ? el.scrollLeft - pos : 0);
      frame = requestAnimationFrame(tick);
    };

    const touch = () => {
      live.current.idle = 0;
    };
    const down = () => {
      live.current.touching = true;
      touch();
    };
    const up = () => {
      live.current.touching = false;
      touch();
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchend', up, { passive: true });
    el.addEventListener('wheel', touch, { passive: true });
    el.addEventListener('mouseenter', down);
    el.addEventListener('mouseleave', up);

    // Start in the middle copy, with the first app in the middle.
    el.scrollLeft = width() + sw / 2 - half;
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchend', up);
      el.removeEventListener('wheel', touch);
      el.removeEventListener('mouseenter', down);
      el.removeEventListener('mouseleave', up);
    };
  }, [apps]);

  // The search found an app: bring its nearest copy to the middle.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !focus) return;
    const slots = [...el.querySelectorAll<HTMLElement>('[data-slot]')];
    const sw = slots[0]?.offsetWidth ?? 0;
    const targets = slots
      .filter((s) => s.dataset.slug === focus)
      .map((s) => s.offsetLeft + sw / 2 - el.clientWidth / 2)
      .sort((a, b) => Math.abs(a - el.scrollLeft) - Math.abs(b - el.scrollLeft));
    const target = targets[0];
    if (target === undefined) return;
    const reduce = reducedMotion();
    if (reduce) {
      el.scrollLeft = target;
      return;
    }
    const from = el.scrollLeft;
    const t0 = performance.now();
    let frame = 0;
    live.current.centering = true;
    const stepTo = (t: number) => {
      const p = Math.min(1, (t - t0) / CENTER_MS);
      el.scrollLeft = from + (target - from) * (1 - (1 - p) ** 3);
      if (p < 1) frame = requestAnimationFrame(stepTo);
      else live.current.centering = false;
    };
    frame = requestAnimationFrame(stepTo);
    return () => {
      cancelAnimationFrame(frame);
      live.current.centering = false;
    };
  }, [focus]);

  // A computer: drag the lane with the mouse; a finger scrolls it natively.
  const onPointerDown = (e: ReactPointerEvent) => {
    live.current.idle = 0;
    live.current.dragged = false;
    if (e.pointerType !== 'mouse') return;
    const el = scroller.current;
    if (!el) return;
    live.current.drag = { x: e.clientX, left: el.scrollLeft };
    const move = (ev: PointerEvent) => {
      const d = live.current.drag;
      if (!d) return;
      const dx = ev.clientX - d.x;
      if (Math.abs(dx) > DRAG_PX) live.current.dragged = true;
      el.scrollLeft = d.left - dx;
    };
    const up = () => {
      live.current.drag = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onClickCapture = (e: MouseEvent) => {
    if (!live.current.dragged) return;
    live.current.dragged = false;
    e.preventDefault();
  };

  return (
    <div className={styles.lane} data-hero-lane="catalog">
      <div
        ref={scroller}
        className={styles.track}
        data-lane-track=""
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
      >
        {items.map(({ app, named }, i) => (
          <Link
            // biome-ignore lint/suspicious/noArrayIndexKey: icons repeat, the position is the key
            key={i}
            className={styles.item}
            href={`/?app=${encodeURIComponent(app.slug)}`}
            scroll={false}
            draggable={false}
            data-slot=""
            data-slug={app.slug}
            data-hit={found?.includes(app.slug) ? '' : undefined}
            data-dim={found && !found.includes(app.slug) ? '' : undefined}
            aria-hidden={named ? undefined : true}
            tabIndex={named ? undefined : -1}
          >
            {/* biome-ignore lint/performance/noImgElement: small catalog icons from S3 */}
            <img
              className={styles.icon}
              src={app.iconUrl}
              alt={named ? app.name : ''}
              draggable={false}
            />
          </Link>
        ))}
      </div>
      <p
        ref={name}
        className={styles.name}
        data-lane-name=""
        data-show={found ? '' : undefined}
        aria-hidden="true"
      >
        {apps[0]?.name}
      </p>
    </div>
  );
}
