import styles from './AppIcon.module.css';

export type AppIconProps = {
  src?: string;
  alt: string;
  size: 56 | 76 | 120;
};

/** iOS squircle icon. Without `src` shows a neutral surface; empty `alt` marks it decorative. */
export function AppIcon({ src, alt, size }: AppIconProps) {
  const className = `${styles.icon} ${styles[`s${size}`]}`;
  if (src) {
    return (
      <img
        className={className}
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        aria-hidden={alt ? undefined : true}
      />
    );
  }
  return alt ? (
    <span className={`${className} ${styles.placeholder}`} role="img" aria-label={alt} />
  ) : (
    <span className={`${className} ${styles.placeholder}`} aria-hidden="true" />
  );
}
