'use client';

import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import styles from './MoreText.module.css';

export type MoreTextProps = {
  text: string;
  lines?: number;
};

/** Clamped description with an «ещё» button; the button hides when the text already fits. */
export function MoreText({ text, lines = 3 }: MoreTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [fits, setFits] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text or clamp changes
  useLayoutEffect(() => {
    const el = paragraph.current;
    // No layout (SSR, jsdom) → clientHeight 0: keep the button.
    setFits(Boolean(el && el.clientHeight > 0 && el.scrollHeight <= el.clientHeight));
  }, [text, lines]);

  return (
    <div className={styles.root}>
      <p
        ref={paragraph}
        className={styles.text}
        data-expanded={expanded}
        style={{ '--lines': String(lines) } as CSSProperties}
      >
        {text}
      </p>
      {expanded || fits ? null : (
        <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
          ещё
        </button>
      )}
    </div>
  );
}
