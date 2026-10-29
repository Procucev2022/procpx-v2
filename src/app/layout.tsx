// app/layout.tsx - Root layout
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'proCPX Procurement | Enterprise Capex Procurement Platform',
  description: 'proCPX is a production-grade enterprise Capex Procurement platform for Retail, Hospitality, Banking, and Insurance sectors.',
  robots: 'noindex, nofollow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
