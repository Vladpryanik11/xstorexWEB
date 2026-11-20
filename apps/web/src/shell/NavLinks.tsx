'use client';

import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, type RefObject, useEffect, useId, useState } from 'react';
import styles from './Header.module.css';
import { isActive, isCatalogPath, type NavItem } from './nav';
import type { CatalogMenuState } from './useCatalogMenu';

export type NavLinksProps = {
  items: NavItem[];
  /** Overrides the current path (dev showcase). */
  forcedPath?: string;
  /** The «Каталог» button and its panel, first in the row (desktop only). */
  catalog?: {
    menu: CatalogMenuState;
    buttonRef: RefObject<HTMLButtonElement | null>;
    buttonId: string;
    panelId: string;
    panel: ReactNode;
  };
};

const CATALOG = '#catalog';

/**
 * Menu row with a highlight that slides between items, adapted from 21st.dev «Floating Glassmorphic
 * Navbar with Morphing Pill Indicator» by themeocean
 * (https://21st.dev/@themeocean/components/floating-glassmorphic-navbar-with-morphing-pill-indicator).
 * The highlight rests on the active item and follows the hovered one with a fine pointer.
 */
export function NavLinks({ items, forcedPath, catalog }: NavLinksProps) {
  const pathname = usePathname();
  const path = forcedPath ?? pathname;
  const [hovered, setHovered] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const group = useId();
  const catalogCurrent = catalog !== undefined && isCatalogPath(path);
  const active = catalogCurrent
    ? CATALOG
    : (items.find((item) => isActive(path, item.href))?.href ?? null);
  const open = catalog?.menu.open ?? false;
  const lit = open ? CATALOG : (hovered ?? active);
  const hide = catalog?.menu.hide;

  // A new page closes the panel.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `path` is the trigger, not a value read here
  useEffect(() => {
    hide?.();
  }, [path, hide]);

  const highlight = (
    <motion.span
      data-nav-highlight=""
      className={styles.highlight}
      layoutId="nav-highlight"
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
      aria-hidden="true"
    />
  );

  return (
    <LayoutGroup id={group}>
      <ul className={styles.row} onMouseLeave={() => setHovered(null)}>
        {catalog ? (
          <li className={styles.catalogItem}>
            <button
              ref={catalog.buttonRef}
              id={catalog.buttonId}
              type="button"
              className={`${styles.link} ${styles.catalog}`}
              aria-expanded={open}
              aria-controls={catalog.panelId}
              data-current={catalogCurrent ? 'true' : undefined}
              onMouseEnter={() => {
                setHovered(CATALOG);
                catalog.menu.hoverOpen();
              }}
              onClick={catalog.menu.toggle}
            >
              {lit === CATALOG ? highlight : null}
              <span className={styles.label}>Каталог</span>
              <svg
                className={styles.caret}
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path d="m7 10 5 5 5-5" />
              </svg>
            </button>
            {open ? catalog.panel : null}
          </li>
        ) : null}
        {items.map((item) => (
          <li key={item.href}>
            <Link
              className={styles.link}
              href={item.href}
              aria-current={item.href === active ? 'page' : undefined}
              onMouseEnter={() => {
                setHovered(item.href);
                hide?.();
              }}
            >
              {item.href === lit ? highlight : null}
              <span className={styles.label}>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </LayoutGroup>
  );
}
