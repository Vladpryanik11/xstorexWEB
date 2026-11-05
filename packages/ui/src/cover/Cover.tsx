import type { ReactNode } from 'react';
import styles from './Cover.module.css';

export type CoverProps = {
  src?: string;
  alt: string;
  /** Overlay content (badges, captions) laid over the cover. */
  children?: ReactNode;
};

/** 16:10 screenshot or cover image. */
export function Cover({ src, alt, children }: CoverProps) {
  return (
    <div className={styles.cover}>
      {src ? (
        <img className={styles.image} src={src} alt={alt} loading="lazy" decoding="async" />
      ) : (
        <div className={styles.image} role="img" aria-label={alt} />
      )}
      {children ? <div className={styles.overlay}>{children}</div> : null}
    </div>
  );
}
