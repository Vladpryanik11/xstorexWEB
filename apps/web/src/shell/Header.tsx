import Link from 'next/link';
import styles from './Header.module.css';
import { MobileMenu } from './MobileMenu';
import { NavLinks } from './NavLinks';
import { navItems } from './nav';

export type HeaderProps = {
  signedIn: boolean;
  /** Transparent over the home hero; the gradient fades in over the first 6rem of scroll. */
  overHero?: boolean;
  /** Overrides the current path (dev showcase). */
  forcedPath?: string;
};

export function Header({ signedIn, overHero = false, forcedPath }: HeaderProps) {
  const items = navItems(signedIn);

  return (
    <header className={overHero ? `${styles.header} ${styles.over}` : styles.header}>
      <div className={styles.tint} aria-hidden="true" />
      <div className={styles.inner}>
        <Link className={styles.mark} href="/" aria-label="Xstore, на главную">
          {/* biome-ignore lint/performance/noImgElement: a 38px static SVG needs no optimisation */}
          <img src="/brand/mark.svg" alt="" width={38} height={38} />
        </Link>
        <nav className={styles.menu} aria-label="Основное меню">
          <NavLinks items={items} forcedPath={forcedPath} />
          <MobileMenu items={items} signedIn={signedIn} forcedPath={forcedPath} />
        </nav>
        <div className={styles.end}>
          {signedIn ? (
            // Sign-out must never be prefetched.
            <Link className={styles.quiet} href="/signout" prefetch={false}>
              Выйти
            </Link>
          ) : (
            <>
              <Link className={styles.entry} href="/install">
                Установить
              </Link>
              <Link className={styles.quiet} href="/signin">
                Войти
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
