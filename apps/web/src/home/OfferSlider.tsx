'use client';

import { Children, type ReactNode, useEffect, useRef, useState } from 'react';
import styles from './OfferSlider.module.css';

const PHONE = '(max-width: 47.99em)';
const REDUCED = '(prefers-reduced-motion: reduce)';
const STEP_MS = 3500;

type Props = { label: string; className?: string; children: ReactNode };

/**
 * The hero's offer points (spec v2 §3.1). On a computer it is a plain list; on a phone the
 * list becomes a mini banner that turns by itself (swipe works too) with dots under it.
 * Auto-turning stops for reduced motion and once the visitor touches it.
 */
export function OfferSlider({ label, className, children }: Props) {
  const count = Children.count(children);
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held || count < 2 || typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia(PHONE).matches || window.matchMedia(REDUCED).matches) return;
    const id = window.setInterval(() => {
      setActive((i) => {
        const next = (i + 1) % count;
        const el = track.current;
        el?.scrollTo?.({ left: next * el.clientWidth, behavior: 'smooth' });
        return next;
      });
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [count, held]);

  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth > 0) setActive(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className={styles.slider}>
      <ul
        ref={track}
        className={className}
        aria-label={label}
        onScroll={onScroll}
        onPointerDown={() => setHeld(true)}
      >
        {children}
      </ul>
      <div className={styles.dots} aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: dots are positions, not data
          <span key={i} data-dot data-on={i === active} className={styles.dot} />
        ))}
      </div>
    </div>
  );
}
