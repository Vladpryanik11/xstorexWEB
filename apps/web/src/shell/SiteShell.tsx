import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { Header } from './Header';

/**
 * Public site chrome: the `(site)` and `(home)` layouts and the root 404 and error pages, which
 * sit outside those groups. The header reads the session in the browser (`useNavState`), so the
 * pages themselves stay the same for every visitor.
 */
export function SiteShell({
  children,
  overHero = false,
}: {
  children: ReactNode;
  /** Home page: the header sits transparent over the hero. */
  overHero?: boolean;
}) {
  return (
    <>
      <Header overHero={overHero} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
