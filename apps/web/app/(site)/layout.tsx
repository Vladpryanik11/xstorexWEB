import type { ReactNode } from 'react';
import { SiteShell } from '../../src/shell/SiteShell';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
