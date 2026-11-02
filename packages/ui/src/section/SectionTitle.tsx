import type { ReactNode } from 'react';
import styles from './SectionTitle.module.css';

export type SectionTitleProps = {
  href?: string;
  children: ReactNode;
};

export function SectionTitle({ href, children }: SectionTitleProps) {
  return (
    <h2 className={styles.title}>
      {href ? (
        <a href={href} className={styles.link}>
          {children}
          <span className={styles.chevron} aria-hidden="true">
            ›
          </span>
        </a>
      ) : (
        children
      )}
    </h2>
  );
}
