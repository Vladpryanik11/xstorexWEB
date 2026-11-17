'use client';

import type { CategoryView } from '@xstore/shared';
import { Chip } from '@xstore/ui';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { useId, useState } from 'react';
import styles from './CategoryChips.module.css';
import { CategoryIcon } from './CategoryIcon';
import { categoryHref } from './links';

export type CategoryChipsProps = {
  categories: CategoryView[];
  /** Slug of the category being shown, highlighted as the active chip. */
  active?: string;
};

/**
 * Category chips with one sliding background, adapted from Motion Primitives «Animated Background»
 * (https://motion-primitives.com/docs/animated-background): it rests on the active chip and
 * follows the hovered one.
 */
export function CategoryChips({ categories, active }: CategoryChipsProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const group = useId();
  if (categories.length === 0) return null;
  const lit = hovered ?? active ?? null;

  return (
    <nav className={styles.chips} aria-label="Категории">
      <LayoutGroup id={group}>
        <ul className={styles.list} onMouseLeave={() => setHovered(null)}>
          {categories.map((c) => (
            <li key={c.slug}>
              <Chip
                href={categoryHref(c.slug)}
                icon={<CategoryIcon name={c.icon} />}
                active={c.slug === active}
                onMouseEnter={() => setHovered(c.slug)}
                highlight={
                  c.slug === lit ? (
                    <motion.span
                      data-chip-highlight=""
                      className={
                        c.slug === active
                          ? `${styles.highlight} ${styles.onActive}`
                          : styles.highlight
                      }
                      layoutId="chip-highlight"
                      transition={
                        reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
                      }
                      aria-hidden="true"
                    />
                  ) : null
                }
              >
                {c.name}
              </Chip>
            </li>
          ))}
        </ul>
      </LayoutGroup>
    </nav>
  );
}
