import type { ReactNode } from 'react';
import styles from './BorderBeam.module.css';

export type BorderBeamProps = {
  children: ReactNode;
  className?: string;
};

/**
 * A light beam running along the border, adapted from Magic UI «Border Beam»
 * (https://magicui.design/docs/components/border-beam) to pure CSS: a rotating conic gradient
 * masked to the border ring. Stands still under reduced motion.
 */
export function BorderBeam({ children, className }: BorderBeamProps) {
  return (
    <div className={className ? `${styles.root} ${className}` : styles.root}>
      {children}
      <span className={styles.beam} data-border-beam="" aria-hidden="true" />
    </div>
  );
}
