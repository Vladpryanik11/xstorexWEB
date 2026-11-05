import type { ReactNode } from 'react';
import { AppIcon } from '../app-icon/AppIcon';
import styles from './AppRow.module.css';

export type AppRowProps = {
  href: string;
  iconSrc?: string;
  name: string;
  subtitle?: string;
  /** Rendered next to the link, never inside it (no nested interactive elements). */
  action?: ReactNode;
};

export function AppRow({ href, iconSrc, name, subtitle, action }: AppRowProps) {
  return (
    <div className={styles.row}>
      <a href={href} className={styles.link}>
        <AppIcon src={iconSrc} alt="" size={56} />
        <span className={styles.text}>
          <span className={styles.name}>{name}</span>
          {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
        </span>
      </a>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
