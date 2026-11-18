import type { AppCard } from '@xstore/shared';
import { IconTile } from '@xstore/ui';
import styles from './IconGrid.module.css';
import { appHref } from './links';

/** Section and category pages: apps as a grid of icons with names (owner 2026-11-18). */
export function IconGrid({ apps, label }: { apps: AppCard[]; label: string }) {
  return (
    <ul className={styles.grid} aria-label={label}>
      {apps.map((app) => (
        <li key={app.slug} className={styles.item}>
          <IconTile href={appHref(app.slug)} iconSrc={app.iconUrl} name={app.name} />
        </li>
      ))}
    </ul>
  );
}
