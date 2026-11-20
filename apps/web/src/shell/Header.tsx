'use client';

import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';
import { CatalogPanel } from './CatalogPanel';
import styles from './Header.module.css';
import { HeaderFrame } from './HeaderFrame';
import { MobileMenu } from './MobileMenu';
import { NavLinks } from './NavLinks';
import { type NavState, navFor, navItems } from './nav';
import { useCatalogMenu } from './useCatalogMenu';
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
  const catalog = useCatalogMenu();
  const pillRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const buttonId = useId();
  const panelId = useId();
  const { open, hide } = catalog;

  // Esc returns to «Каталог»; a press outside the pill and the panel closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      hide();
      buttonRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!pillRef.current?.contains(event.target as Node)) hide();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, hide]);

  return (
    <HeaderFrame className={overHero ? `${styles.header} ${styles.over}` : styles.header}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover only keeps the mouse panel open; keyboard and touch use the «Каталог» button */}
      <div
        ref={pillRef}
        className={styles.pill}
        onMouseEnter={catalog.cancel}
        onMouseLeave={() => {
          if (open) catalog.hideSoon();
        }}
      >
        <nav className={styles.menu} aria-label="Основное меню">
          <NavLinks
            items={items}
            forcedPath={forcedPath}
            catalog={{
              menu: catalog,
              buttonRef,
              buttonId,
              panelId,
              panel: (
                <CatalogPanel
                  id={panelId}
                  labelledBy={buttonId}
                  nav={state}
                  icons={catalog.icons}
                  onNavigate={hide}
                />
              ),
            }}
          />
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
      {/* After the pill, so the pill stays the header's first box; z-index puts it behind. */}
      {open ? <div className={styles.scrim} aria-hidden="true" /> : null}
    </HeaderFrame>
  );
}
