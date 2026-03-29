import type { Metadata } from 'next';
import './globals.css';
import LoadingWrapper from '@/components/ui/LoadingWrapper';

export const metadata: Metadata = {
  title: 'Lineup — Prediction Market Alpha Engine',
  description: 'Eight strategy scanners, structured statistical modeling, real Edge Scores.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
        <LoadingWrapper>{children}</LoadingWrapper>
      </body>
    </html>
  );
}
