'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import styles from './Header.module.css';
import { isActive, type NavItem } from './nav';

export type MobileMenuProps = {
  items: NavItem[];
  signedIn: boolean;
  /** Overrides the current path (dev showcase). */
  forcedPath?: string;
};

// 24px line icons, drawn for Xstore.
const strokes: Record<string, ReactNode> = {
  '/install': (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <path d="M12 8.25v7.5M8.25 12h7.5" />
    </>
  ),
  '/devices': (
    <>
      <rect x="6.5" y="2.75" width="11" height="18.5" rx="2.75" />
      <path d="M10.5 18h3" />
    </>
  ),
  '/profile': (
    <>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.75 20c.9-3.6 3.7-5.5 7.25-5.5s6.35 1.9 7.25 5.5" />
    </>
  ),
  '/blog': (
    <>
      <path d="M14 3.75H7.25a1.5 1.5 0 0 0-1.5 1.5v13.5a1.5 1.5 0 0 0 1.5 1.5h9.5a1.5 1.5 0 0 0 1.5-1.5V8z" />
      <path d="M14 3.75V8h4.25M9 12.5h6M9 16h4" />
    </>
  ),
  '/faq': (
    <>
      <path d="M12 3.75c4.56 0 8.25 3.25 8.25 7.25s-3.69 7.25-8.25 7.25c-.97 0-1.9-.15-2.76-.42L5 19.75l1.1-3.6C4.68 14.85 3.75 13.02 3.75 11c0-4 3.69-7.25 8.25-7.25z" />
      <path d="M10.1 9.4a1.95 1.95 0 1 1 2.75 1.78c-.55.25-.85.7-.85 1.3v.27M12 15.1v.05" />
    </>
  ),
  '/support': (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="m6.2 6.2 3.3 3.3m5 5 3.3 3.3m0-11.6-3.3 3.3m-5 5-3.3 3.3" />
    </>
  ),
  '/signin': (
    <>
      <path d="M14 4.25h3.25a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H14" />
      <path d="M4.75 12h9.5m0 0-3.75-3.75M14.25 12l-3.75 3.75" />
    </>
  ),
  '/signout': (
    <>
      <path d="M10 4.25H6.75a2 2 0 0 0-2 2v11.5a2 2 0 0 0 2 2H10" />
      <path d="M9.75 12h9.5m0 0-3.75-3.75M19.25 12l-3.75 3.75" />
    </>
  ),
};

function Icon({ href }: { href: string }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {strokes[href]}
    </svg>
  );
}

/** How long the sheet takes to slide out (matches `.leaving` in Header.module.css). */
const LEAVE_MS = 220;

export function MobileMenu({ items, signedIn, forcedPath }: MobileMenuProps) {
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

  // Any real navigation closes the sheet: the logo and the entry pill stay clickable above it,
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

  const row = (href: string, label: string, quiet = false) => (
    <li key={href}>
      <Link
        className={quiet ? `${styles.item} ${styles.quietItem}` : styles.item}
        href={href}
        prefetch={href === '/signout' ? false : undefined}
        aria-current={isActive(path, href) ? 'page' : undefined}
        onClick={() => setState('closed')}
      >
        <Icon href={href} />
        <span>{label}</span>
      </Link>
    </li>
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
            <ul className={styles.sheetList}>
              {signedIn ? null : row('/install', 'Установить')}
              {items.map((item) => row(item.href, item.label))}
            </ul>
            <ul className={styles.sheetList}>
              {signedIn ? row('/signout', 'Выйти', true) : row('/signin', 'Войти', true)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
