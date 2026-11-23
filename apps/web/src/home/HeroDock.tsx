'use client';

import type { AppCard } from '@xstore/shared';
import Link from 'next/link';
import { type CSSProperties, type PointerEvent, type ReactNode, useRef, useState } from 'react';
import styles from './HeroDock.module.css';

export type DockState =
  | { kind: 'idle' }
  | { kind: 'loading'; q: string }
  | { kind: 'done'; q: string; items: AppCard[]; more: boolean }
  | { kind: 'error'; q: string };

/** At most this many apps on the shelf; a phone shows the first five (CSS). */
const SHOWN = 7;
/** Dock effect on a computer: icons grow from 64 to 84 px within 150 px of the mouse. */
const BASE = 64;
const GROWN = 84;
const RANGE = 150;

const smooth = (k: number) => k * k * (3 - 2 * k);

/**
 * The shelf of found apps (spec 2026-11-23-home-first-screen §3.4, owner 2026-11-23, variant В).
 * On a computer with a mouse the icons grow under the cursor, like Aceternity «Floating Dock»
 * (https://ui.aceternity.com/components/floating-dock, sent by the owner), rebuilt on CSS Modules
 * without Tailwind or Motion; a phone has no such effect.
 */
export function HeroDock({ state }: { state: DockState }) {
  const items = useRef<(HTMLAnchorElement | null)[]>([]);
  const [sizes, setSizes] = useState<number[] | null>(null);

  if (state.kind === 'idle') return null;

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !window.matchMedia('(min-width: 64em)').matches) return;
    setSizes(
      items.current.map((el) => {
        if (!el) return BASE;
        const r = el.getBoundingClientRect();
        const k = Math.max(0, 1 - Math.abs(e.clientX - (r.left + r.width / 2)) / RANGE);
        return BASE + (GROWN - BASE) * smooth(k);
      }),
    );
  };

  let body: ReactNode;
  if (state.kind === 'loading') {
    body = <p className={styles.note}>Ищем…</p>;
  } else if (state.kind === 'error') {
    body = (
      <p className={styles.note}>
        Поиск не ответил
        <br />
        <a className={styles.link} href={`/search?q=${encodeURIComponent(state.q)}`}>
          Открыть поиск
        </a>
      </p>
    );
  } else if (state.items.length === 0) {
    body = (
      <p className={styles.note}>
        Такого приложения пока нет в каталоге
        <br />
        <a className={styles.link} href="/catalog">
          Весь каталог
        </a>
      </p>
    );
  } else {
    body = state.items.slice(0, SHOWN).map((app, i) => (
      <Link
        key={app.slug}
        ref={(el) => {
          items.current[i] = el;
        }}
        className={styles.item}
        href={`/?app=${encodeURIComponent(app.slug)}`}
        scroll={false}
        data-dock-app=""
        style={sizes?.[i] ? ({ '--dock-size': `${sizes[i]}px` } as CSSProperties) : undefined}
      >
        {app.iconUrl ? (
          // biome-ignore lint/performance/noImgElement: small catalog icons from S3
          <img className={styles.icon} src={app.iconUrl} alt="" />
        ) : (
          <span className={styles.icon} />
        )}
        <span className={styles.name}>{app.name}</span>
      </Link>
    ));
  }

  return (
    <div
      className={styles.shelf}
      data-testid="hero-dock"
      onPointerMove={onPointerMove}
      onPointerLeave={() => setSizes(null)}
    >
      {body}
    </div>
  );
}
