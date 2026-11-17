import Link from 'next/link';
import styles from './Header.module.css';
import { HeaderFrame } from './HeaderFrame';
import { MobileMenu } from './MobileMenu';
import { NavLinks } from './NavLinks';
import { navItems } from './nav';

export type HeaderProps = {
  signedIn: boolean;
  /** Home page: the pill floats over the hero, which starts under it. */
  overHero?: boolean;
  /** Overrides the current path (dev showcase). */
  forcedPath?: string;
};

/** Floating white glass pill (spec 2026-11-17 §5). */
export function Header({ signedIn, overHero = false, forcedPath }: HeaderProps) {
  const items = navItems(signedIn);

  return (
    <HeaderFrame className={overHero ? `${styles.header} ${styles.over}` : styles.header}>
      <div className={styles.pill}>
        <Link className={styles.mark} href="/" aria-label="Xstore, на главную">
          {/* biome-ignore lint/performance/noImgElement: a 36px static SVG needs no optimisation */}
          <img src="/brand/mark.svg" alt="" width={36} height={36} />
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
    </HeaderFrame>
  );
}
