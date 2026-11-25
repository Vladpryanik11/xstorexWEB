import '@xstore/ui/tokens.css';
import './globals.css';
import { Toaster } from '@xstore/ui';
import type { Metadata, Viewport } from 'next';
import { Inter_Tight, Onest } from 'next/font/google';
import type { ReactNode } from 'react';
import { SessionRenewal } from '../src/auth/SessionRenewal';

// Onest sets the text; Inter Tight 600 the headings (owner 2026-11-25, ПК пункт 5: Unbounded left
// the site). next/font self-hosts both.
const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-onest',
  display: 'swap',
});

// Every heading (owner 2026-11-23 «ближе к Apple», 2026-11-25 everywhere): Inter Tight 600.
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
  // The pages are white (owner 2026-11-25), so is the iPhone status bar over them.
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${onest.variable} ${interTight.variable}`}>
      <body>
        <SessionRenewal />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
