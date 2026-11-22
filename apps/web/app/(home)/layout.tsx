import type { ReactNode } from 'react';
import { Intro, IntroGate } from '../../src/intro/Intro';
import { SiteShell } from '../../src/shell/SiteShell';

// The home page has its own group: only here the header sits transparent over the hero.
// The intro (spec 2026-11-22-intro) lives here too: home only, first visit only.
export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <IntroGate />
      <Intro />
      <SiteShell overHero>{children}</SiteShell>
    </>
  );
}
