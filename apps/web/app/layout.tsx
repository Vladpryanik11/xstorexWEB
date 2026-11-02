import '@xstore/ui/tokens.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

// Inter is only the fallback after Helvetica Neue/Helvetica (iPhone and most desktops never
// reach it), so it is not preloaded: browsers fetch it only where it is actually used.
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: { default: 'Xstore — магазин приложений для iPhone', template: '%s — Xstore' },
  description: 'Приложения для iPhone с установкой прямо из Safari.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0c45b7',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
