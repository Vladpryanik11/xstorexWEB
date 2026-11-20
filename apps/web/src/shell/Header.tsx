'use client';

import Link from 'next/link';
import styles from './Header.module.css';
import { HeaderFrame } from './HeaderFrame';
import { MobileMenu } from './MobileMenu';
import { NavLinks } from './NavLinks';
import { type NavState, navFor, navItems } from './nav';
import { useNavState } from './useNavState';

export type HeaderProps = {
  /** Forces the session (tests, dev showcase); left out, it is read after mount. */
  nav?: NavState;
  /** Home page: the pill floats over the hero, which starts under it. */
  overHero?: boolean;
  /** Overrides the current path (dev showcase). */
  forcedPath?: string;
};

/** Floating white glass pill (spec 2026-11-17 §5). */
export function Header({ nav, overHero = false, forcedPath }: HeaderProps) {
  const state = useNavState(nav);
  const items = navItems();

  return (
    <HeaderFrame className={overHero ? `${styles.header} ${styles.over}` : styles.header}>
      <div className={styles.pill}>
        <nav className={styles.menu} aria-label="Основное меню">
          <NavLinks items={items} forcedPath={forcedPath} />
          <MobileMenu nav={state} forcedPath={forcedPath} />
        </nav>
        <div className={styles.end}>
          {navFor(state).map((item) => (
            <Link
              key={item.href}
              className={item.kind === 'entry' ? styles.entry : styles.quiet}
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </HeaderFrame>
  );
}
