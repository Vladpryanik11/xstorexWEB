import type { ReactNode } from 'react';
import styles from './Chip.module.css';

export type ChipProps = {
  href: string;
  icon?: ReactNode;
  active?: boolean;
  children: ReactNode;
  /** A sliding background (Animated Background) painted under the label. */
  highlight?: ReactNode;
  onMouseEnter?: () => void;
};

export function Chip({ href, icon, active = false, children, highlight, onMouseEnter }: ChipProps) {
  return (
    <a
      href={href}
      className={styles.chip}
      aria-current={active ? 'page' : undefined}
      onMouseEnter={onMouseEnter}
    >
      {highlight}
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={styles.label}>{children}</span>
    </a>
  );
}
