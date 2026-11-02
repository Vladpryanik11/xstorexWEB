import type { ReactNode } from 'react';
import { Footer } from '../../src/shell/Footer';
import { Header } from '../../src/shell/Header';

// Public site chrome. Auth arrives in M2; until then every visitor is a guest.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header signedIn={false} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
