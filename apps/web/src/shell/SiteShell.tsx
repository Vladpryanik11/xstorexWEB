import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { Header } from './Header';

/**
 * Public site chrome: the `(site)` layout and the root 404 and error pages, which sit outside
 * that group. Auth arrives in M2; until then every visitor is a guest.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header signedIn={false} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
