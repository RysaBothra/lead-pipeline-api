import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import SmoothScroll from '@/components/SmoothScroll';

export const metadata: Metadata = {
  title: 'LeadsIQ — the easiest way to get qualified leads',
  description:
    'Drop in your website URL. LeadsIQ figures out who to target, writes the outreach, and brings you qualified replies. You only pay when someone is actually interested.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sora antialiased">
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
