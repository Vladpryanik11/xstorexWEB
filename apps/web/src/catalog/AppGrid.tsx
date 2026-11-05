import type { AppCard } from '@xstore/shared';
import { AppCardRow } from './AppCardRow';
import styles from './AppGrid.module.css';

/** Full-page list of apps: one column on phones, up to three on wide screens. */
export function AppGrid({ apps, label }: { apps: AppCard[]; label: string }) {
  return (
    <ul className={styles.grid} aria-label={label}>
      {apps.map((app) => (
        <li key={app.slug}>
          <AppCardRow app={app} />
        </li>
      ))}
    </ul>
  );
}
