import styles from './InstallBanner.module.css';

export type InstallBannerProps = {
  href: string;
};

/** Floating bottom banner inviting to add Xstore to the home screen. The whole card is clickable. */
export function InstallBanner({ href }: InstallBannerProps) {
  return (
    <aside className={styles.banner} aria-label="Установить Xstore">
      <img className={styles.mark} src="/brand/mark.svg" alt="" width={40} height={40} />
      <span className={styles.text}>
        <span className={styles.title}>Xstore</span>
        <span className={styles.subtitle}>Больше приложений</span>
      </span>
      <a href={href} className={styles.pill}>
        Установить
      </a>
    </aside>
  );
}
