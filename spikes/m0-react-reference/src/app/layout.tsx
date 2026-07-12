import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

// MaterialApp(title:) -> route metadata.
export const metadata: Metadata = {
  title: 'Hello Bridge',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // `themeMode: _isDark ? dark : light` would drive data-theme here. The signal that decides it
  // lives in BridgeApp and is toggled from the Home screen — i.e. it is exactly ISSUE-1. The
  // reference pins the light theme rather than inventing a resolution.
  return (
    <html lang="en" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
