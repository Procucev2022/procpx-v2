// app/layout.tsx - Root layout
import type { Metadata } from 'next';
import './globals.css';
import { metadata } from "./layout.constants";
import { I18N_CONFIG } from '@/lib/i18n.constants';
export { metadata };


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={I18N_CONFIG.defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
