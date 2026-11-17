import '@xstore/ui/tokens.css';
import './globals.css';
import { Toaster } from '@xstore/ui';
import type { Metadata, Viewport } from 'next';
import { Inter, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import { SessionRenewal } from '../src/auth/SessionRenewal';

// Spec 2026-11-17-typography: Inter sets all text, Manrope the headings. next/font self-hosts both.
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-manrope',
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
    <html lang="ru" className={`${inter.variable} ${manrope.variable}`}>
      <body>
        <SessionRenewal />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
