'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import styles from './Header.module.css';
import { isActive, type NavItem, type NavState, phoneMenu, SUPPORT_MAIL } from './nav';

export type MobileMenuProps = {
  nav: NavState;
  /** Overrides the current path (dev showcase). */
  forcedPath?: string;
};

/** How long the sheet takes to slide out (matches `.leaving` in Header.module.css). */
const LEAVE_MS = 220;

/** From this width the menu row replaces the burger (the ≥48em block in Header.module.css). */
const WIDE = '(min-width: 48em)';

/**
 * Phone menu (owner 2026-11-25, spec 2026-11-25-mobile-menu-design): one white panel under the
 * round button, adapted from the mobile menu of Aceternity «Resizable Navbar»
 * (https://ui.aceternity.com/components/resizable-navbar): the word home, a blue subscription
 * card with its two buttons, the catalog large, the secondary pages small and grey, the support
 * mail. Keeps the modal dialog behaviour: focus trap, Escape, closing on navigation and on
 * crossing 48em.
 */
export function MobileMenu({ nav, forcedPath }: MobileMenuProps) {
  const pathname = usePathname();
  const path = forcedPath ?? pathname;
  const [state, setState] = useState<'closed' | 'open' | 'leaving'>('closed');
  const open = state === 'open';
  const leaving = state === 'leaving';
  const burger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const sheetId = useId();

  const close = useCallback(() => {
    setState('leaving');
    burger.current?.focus();
  }, []);

  // Any real navigation closes the sheet: the entry pill stays clickable above it,
  // and back/forward change the route too. Keyed on the real path, never on forcedPath.
  const shownPath = useRef(pathname);
  useEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    // Focus inside the unmounting sheet would be lost; hand it back to the burger.
    if (sheet.current?.contains(document.activeElement)) burger.current?.focus();
    setState('closed');
  }, [pathname]);

  // A closing sheet stays mounted, hidden and inert, until it has slid out.
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setState('closed'), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  // The burger is hidden from 48em, so a sheet left open by a rotation (iPad) could not be
  // closed: drop it as soon as the viewport crosses the breakpoint.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia(WIDE);
    const onChange = () => {
      if (wide.matches) setState('closed');
    };
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector('a')?.focus();

    // Escape closes; Tab cycles between the burger and the sheet links.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key !== 'Tab' || !burger.current || !sheet.current) return;
      const cycle = [burger.current, ...sheet.current.querySelectorAll('a')];
      const first = cycle[0];
      const last = cycle[cycle.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  const menu = phoneMenu(nav);
  const shut = () => setState('closed');
  const current = (href: string) => (isActive(path, href) ? 'page' : undefined);
  const rows = (items: NavItem[], className: string | undefined, label: string) => (
    <ul className={className} aria-label={label}>
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} aria-current={current(item.href)} onClick={shut}>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={styles.more}>
      <button
        ref={burger}
        type="button"
        className={styles.burger}
        aria-label="Меню"
        aria-expanded={open}
        aria-controls={open ? sheetId : undefined}
        onClick={() => (open ? close() : setState('open'))}
      >
        <span className={styles.bars} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      {state === 'closed' ? null : (
        <div
          ref={sheet}
          id={sheetId}
          className={leaving ? `${styles.sheet} ${styles.leaving}` : styles.sheet}
          role="dialog"
          aria-modal="true"
          aria-label="Меню"
          aria-hidden={leaving || undefined}
          inert={leaving || undefined}
        >
          <div className={styles.sheetBody}>
            <Link
              className={styles.sheetWord}
              href="/"
              aria-label="Xstorex, на главную"
              onClick={shut}
            >
              X<span>storex</span>
            </Link>
            <div className={styles.promo}>
              <span className={styles.promoKicker}>{menu.promo.kicker}</span>
              <span className={styles.promoTitle}>{menu.promo.title}</span>
              <Link
                className={styles.promoPrimary}
                href={menu.promo.primary.href}
                aria-current={current(menu.promo.primary.href)}
                onClick={shut}
              >
                {menu.promo.primary.label}
              </Link>
              {menu.promo.secondary ? (
                <Link
                  className={styles.promoGlass}
                  href={menu.promo.secondary.href}
                  aria-current={current(menu.promo.secondary.href)}
                  onClick={shut}
                >
                  {menu.promo.secondary.label}
                </Link>
              ) : null}
            </div>
            {rows(menu.main, styles.mainList, 'Каталог')}
            {rows(menu.more, styles.moreList, 'Ещё')}
            <p className={styles.support}>
              Поддержка:{' '}
              <a href={`mailto:${SUPPORT_MAIL}`} onClick={shut}>
                {SUPPORT_MAIL}
              </a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
