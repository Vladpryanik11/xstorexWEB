'use client';

import Link from 'next/link';
import styles from './CatalogPanel.module.css';
import { type CatalogMenuItem, catalogMenu, type NavState } from './nav';
import type { SectionIcons } from './useCatalogMenu';

export type CatalogPanelProps = {
  id: string;
  labelledBy: string;
  nav: NavState;
  icons: SectionIcons;
  /** A link was followed: close the panel. */
  onNavigate: () => void;
};

function Glyph({ d }: { d: string }) {
  return (
    <span className={styles.glyph} aria-hidden="true">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={d} />
      </svg>
    </span>
  );
}

function Visual({ item, icons }: { item: CatalogMenuItem; icons: SectionIcons }) {
  const apps = item.section ? (icons[item.section] ?? []) : [];
  if (apps.length === 0) return <Glyph d={item.icon} />;
  return (
    <span className={styles.stack} aria-hidden="true">
      {apps.map((app) => (
        // biome-ignore lint/performance/noImgElement: 40px catalog icons from S3, no optimisation needed
        <img
          key={app.slug}
          className={styles.app}
          src={app.iconUrl}
          alt=""
          width={40}
          height={40}
          decoding="async"
        />
      ))}
    </span>
  );
}

/**
 * The desktop «Каталог» panel under the header pill (spec 2026-11-17 §5, owner 2026-11-20),
 * after Aceternity UI «Navbar Menu» (https://ui.aceternity.com/components/navbar-menu), ported
 * to CSS Modules and Xstore tokens: sections with their apps, the whole catalog, search and a
 * blue card that follows the session.
 */
export function CatalogPanel({ id, labelledBy, nav, icons, onNavigate }: CatalogPanelProps) {
  const { items, promo } = catalogMenu(nav);
  return (
    <section id={id} className={styles.panel} aria-labelledby={labelledBy}>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.href}>
            <Link className={styles.item} href={item.href} onClick={onNavigate}>
              <Visual item={item} icons={icons} />
              <span className={styles.text}>
                <span className={styles.title} data-title="">
                  {item.label}
                </span>
                <span className={styles.lead}>{item.lead}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className={styles.promo}>
        <span className={styles.kicker}>{promo.kicker}</span>
        <span className={styles.promoTitle}>{promo.title}</span>
        <Link className={styles.promoLink} href={promo.href} onClick={onNavigate}>
          {promo.label}
        </Link>
      </div>
    </section>
  );
}
