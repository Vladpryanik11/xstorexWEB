'use client';

import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseDescription } from './description';
import styles from './MoreText.module.css';

export type MoreTextProps = {
  text: string;
  lines?: number;
};

/**
 * Clamped description with an «ещё» button; the button hides when the text already fits.
 * The text may hold groups: «• » lines become a list, a «…:» line before a list its heading.
 */
/** Collapsed: the blocks as plain lines, so the line clamp cuts text, not a list. */
function preview(blocks: ReturnType<typeof parseDescription>): string {
  return blocks
    .map((b) => (b.kind === 'ul' ? b.items.map((i) => `• ${i}`).join('\n') : b.text))
    .join('\n');
}

export function MoreText({ text, lines = 3 }: MoreTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [fits, setFits] = useState(false);
  const clamped = useRef<HTMLParagraphElement>(null);
  const blocks = useMemo(() => parseDescription(text), [text]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text or clamp changes
  useLayoutEffect(() => {
    const el = clamped.current;
    // No layout (SSR, jsdom) → clientHeight 0: keep the button.
    setFits(Boolean(el && el.clientHeight > 0 && el.scrollHeight <= el.clientHeight));
  }, [text, lines]);

  return (
    <div className={styles.root}>
      <div
        className={styles.text}
        data-expanded={expanded}
        style={{ '--lines': String(lines) } as CSSProperties}
      >
        {expanded ? null : (
          <p ref={clamped} className={styles.preview}>
            {preview(blocks)}
          </p>
        )}
        {!expanded
          ? null
          : blocks.map((block, i) => {
              const key = `${block.kind}-${i}`;
              if (block.kind === 'h') {
                return (
                  <h3 key={key} className={styles.heading}>
                    {block.text}
                  </h3>
                );
              }
              if (block.kind === 'ul') {
                return (
                  <ul key={key} className={styles.list}>
                    {block.items.map((item, j) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: items are static text
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                );
              }
              return <p key={key}>{block.text}</p>;
            })}
      </div>
      {expanded || fits ? null : (
        <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
          ещё
        </button>
      )}
    </div>
  );
}
