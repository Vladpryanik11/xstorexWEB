import type { AppCard } from '@xstore/shared';
import { AppPreview } from './AppPreview';
import styles from './IconGrid.module.css';

/** Section and category pages: apps as a grid of icons with names (owner 2026-11-18). */
export function IconGrid({ apps, label }: { apps: AppCard[]; label: string }) {
  return (
    <ul className={styles.grid} aria-label={label}>
      {apps.map((app) => (
        <li key={app.slug} className={styles.item}>
          <AppPreview
            slug={app.slug}
            name={app.name}
            subtitle={app.subtitle ?? app.category?.name}
            iconUrl={app.iconUrl}
          />
        </li>
      ))}
    </ul>
  );
}
