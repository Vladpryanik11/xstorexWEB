import { JetBrains_Mono, Unbounded } from 'next/font/google';

// Spec 2026-11-22-intro: the intro keeps its own fonts. Not preloaded, so visitors who never see
// the intro do not download them; the engine waits for the logo font before measuring letters.
export const introLogoFont = Unbounded({
  subsets: ['latin', 'cyrillic'],
  weight: '300',
  variable: '--intro-font-logo',
  display: 'swap',
  preload: false,
});

export const introMonoFont = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--intro-font-mono',
  display: 'swap',
  preload: false,
});
