// app/layout.tsx - Root layout
import type { Metadata } from 'next';
import './globals.css';
import { metadata } from "./layout.constants";
import { I18N_CONFIG } from '@/lib/i18n.constants';
export { metadata };


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions (password managers, ATM/wallet helpers, etc.) add
    // attributes such as data-*-ext-installed to <html>/<body> before React
    // hydrates. This only ignores attribute differences on these two tags.
    <html lang={I18N_CONFIG.defaultLocale} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
