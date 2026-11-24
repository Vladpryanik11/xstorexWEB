import '@xstore/ui/tokens.css';
import './globals.css';
import { Toaster } from '@xstore/ui';
import type { Metadata, Viewport } from 'next';
import { Inter_Tight, Onest, Unbounded } from 'next/font/google';
import type { ReactNode } from 'react';
import { SessionRenewal } from '../src/auth/SessionRenewal';

// Spec 2026-11-23-home-first-screen §1: Unbounded sets the headings, Onest all other text.
// next/font self-hosts both.
const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-onest',
  display: 'swap',
});

const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  weight: ['500'],
  variable: '--font-unbounded',
  display: 'swap',
});

// The first-screen title (owner 2026-11-23, «ближе к Apple»): Inter Tight 600.
const interTight = Inter_Tight({
  subsets: ['latin', 'cyrillic'],
  weight: ['600'],
  variable: '--font-inter-tight',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Xstore — приложения для iPhone и iPad', template: '%s — Xstore' },
  description:
    'Каталог приложений для iPhone и iPad. Оплата без регистрации, установка прямо с сайта.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#f2f8fd',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${onest.variable} ${unbounded.variable} ${interTight.variable}`}>
      <body>
        <SessionRenewal />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
