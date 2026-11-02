import type { ReactNode } from 'react';
import styles from './Chip.module.css';

export type ChipProps = {
  href: string;
  icon?: ReactNode;
  active?: boolean;
  children: ReactNode;
};

export function Chip({ href, icon, active = false, children }: ChipProps) {
  return (
    <a href={href} className={styles.chip} aria-current={active ? 'page' : undefined}>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </a>
  );
}
