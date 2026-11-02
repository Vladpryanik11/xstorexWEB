'use client';

import { Children, type ReactNode, useRef } from 'react';
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

  // scrollBy without `behavior` follows the CSS scroll-behavior, which is smooth only
  // when the visitor has not asked for reduced motion.
  const scroll = (direction: 1 | -1) => {
    const el = list.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8 });
  };

  return (
    <div className={styles.root}>
      <ul ref={list} className={styles.list} aria-label={label}>
        {Children.map(children, (child) => (
          <li className={styles.item}>{child}</li>
        ))}
      </ul>
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
