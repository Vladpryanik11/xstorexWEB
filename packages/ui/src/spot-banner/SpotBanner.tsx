import styles from './SpotBanner.module.css';

export type SpotBannerProps = {
  href: string;
  imageSrc?: string;
  title: string;
  subtitle?: string;
};

/** Hero carousel card: image with title and subtitle over a bottom gradient. */
export function SpotBanner({ href, imageSrc, title, subtitle }: SpotBannerProps) {
  return (
    <a href={href} className={styles.banner}>
      {imageSrc ? (
        <img className={styles.image} src={imageSrc} alt="" loading="lazy" decoding="async" />
      ) : null}
      <span className={styles.caption}>
        <span className={styles.title}>{title}</span>
        {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
      </span>
    </a>
  );
}
