'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Header.module.css';
import { isActive, type NavItem } from './nav';

export type NavLinksProps = {
  items: NavItem[];
  /** Overrides the current path (dev showcase). */
  forcedPath?: string;
};

export function NavLinks({ items, forcedPath }: NavLinksProps) {
  const pathname = usePathname();
  const path = forcedPath ?? pathname;

  return (
    <ul className={styles.row}>
      {items.map((item) => (
        <li key={item.href}>
          <Link
            className={styles.link}
            href={item.href}
            aria-current={isActive(path, item.href) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
