import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PolyEdge — Prediction Market Alpha Engine',
  description: 'Six strategy scanners, optimized blend, real Edge Scores. The internet knows first.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  );
}
