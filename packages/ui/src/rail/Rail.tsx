'use client';

import { Children, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ProgressiveBlur } from '../progressive-blur/ProgressiveBlur';
import styles from './Rail.module.css';

export type RailProps = {
  children: ReactNode[];
  label: string;
};

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === 'left' ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'} />
    </svg>
  );
}

export function Rail({ children, label }: RailProps) {
  const list = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  // Edges blur only where there is more to scroll (1px slack for fractional widths).
  const measure = useCallback(() => {
    const el = list.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft > 1;
    const end = max - el.scrollLeft > 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    measure();
    const el = list.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  // scrollBy without `behavior` follows the CSS scroll-behavior, which is smooth only
  // when the visitor has not asked for reduced motion.
  const scroll = (direction: 1 | -1) => {
    const el = list.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8 });
  };

  return (
    <div className={styles.root}>
      <ul ref={list} className={styles.list} aria-label={label} onScroll={measure}>
        {Children.map(children, (child) => (
          <li className={styles.item}>{child}</li>
        ))}
      </ul>
      <ProgressiveBlur side="start" visible={edges.start} data-rail-edge="start" />
      <ProgressiveBlur side="end" visible={edges.end} data-rail-edge="end" />
      <button
        type="button"
        className={`${styles.arrow} ${styles.prev}`}
        aria-label="Назад"
        onClick={() => scroll(-1)}
      >
        <Chevron direction="left" />
      </button>
      <button
        type="button"
        className={`${styles.arrow} ${styles.next}`}
        aria-label="Вперёд"
        onClick={() => scroll(1)}
      >
        <Chevron direction="right" />
      </button>
    </div>
  );
}
