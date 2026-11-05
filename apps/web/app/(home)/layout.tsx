import type { ReactNode } from 'react';
import { SiteShell } from '../../src/shell/SiteShell';

// The home page has its own group: only here the header sits transparent over the hero.
export default function HomeLayout({ children }: { children: ReactNode }) {
  return <SiteShell overHero>{children}</SiteShell>;
}
