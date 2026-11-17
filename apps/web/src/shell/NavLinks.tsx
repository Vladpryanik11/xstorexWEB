'use client';

import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';
import styles from './Header.module.css';
import { isActive, type NavItem } from './nav';

export type NavLinksProps = {
  items: NavItem[];
  /** Overrides the current path (dev showcase). */
  forcedPath?: string;
};

/**
 * Menu row with a highlight that slides between items, adapted from 21st.dev «Floating Glassmorphic
 * Navbar with Morphing Pill Indicator» by themeocean
 * (https://21st.dev/@themeocean/components/floating-glassmorphic-navbar-with-morphing-pill-indicator).
 * The highlight rests on the active item and follows the hovered one with a fine pointer.
 */
export function NavLinks({ items, forcedPath }: NavLinksProps) {
  const pathname = usePathname();
  const path = forcedPath ?? pathname;
  const [hovered, setHovered] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const group = useId();
  const active = items.find((item) => isActive(path, item.href))?.href ?? null;
  const lit = hovered ?? active;

  return (
    <LayoutGroup id={group}>
      <ul className={styles.row} onMouseLeave={() => setHovered(null)}>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              className={styles.link}
              href={item.href}
              aria-current={item.href === active ? 'page' : undefined}
              onMouseEnter={() => setHovered(item.href)}
            >
              {item.href === lit ? (
                <motion.span
                  data-nav-highlight=""
                  className={styles.highlight}
                  layoutId="nav-highlight"
                  transition={
                    reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
                  }
                  aria-hidden="true"
                />
              ) : null}
              <span className={styles.label}>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </LayoutGroup>
  );
}
