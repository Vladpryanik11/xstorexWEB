import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { Header } from './Header';

/**
 * Public site chrome: the `(site)` and `(home)` layouts and the root 404 and error pages, which
 * sit outside those groups. Auth arrives in M2; until then every visitor is a guest.
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
      <Header signedIn={false} overHero={overHero} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
