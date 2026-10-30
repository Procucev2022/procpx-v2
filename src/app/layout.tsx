// app/layout.tsx - Root layout
import type { Metadata } from 'next';
import './globals.css';
import { metadata } from "./layout.constants";
export { metadata };


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
