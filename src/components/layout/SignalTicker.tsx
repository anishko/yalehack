'use client';
import { useEffect, useState } from 'react';
import type { RankedSignal } from '@/types';

const SCANNER_COLORS: Record<string, string> = {
  ARB: '#22c55e', SPREAD: '#06b6d4', VELOCITY: '#eab308',
  DIVERGENCE: '#ec4899', SOCIAL: '#a78bfa', CROSS_DOMAIN: '#f97316',
};

export default function SignalTicker({ signals }: { signals: RankedSignal[] }) {
  const [items, setItems] = useState<RankedSignal[]>(signals);

  useEffect(() => { setItems(signals); }, [signals]);

  if (!items.length) {
    return (
      <div style={{ background: '#0d0d10', borderTop: '1px solid var(--border)', padding: '6px 16px', fontSize: 11, color: 'var(--text-muted)' }}>
        🔥 Scanning for signals...
      </div>
    );
  }

  const doubled = [...items, ...items];

  return (
    <div style={{
      background: '#0d0d10',
      borderTop: '1px solid var(--border)',
      padding: '6px 0',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 40, background: 'linear-gradient(to right, #0d0d10, transparent)', zIndex: 2 }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, background: 'linear-gradient(to left, #0d0d10, transparent)', zIndex: 2 }} />
      <div className="ticker-inner">
        {doubled.map((s, i) => (
          <span
            key={`${s.id}-${i}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0 24px', fontSize: 11, whiteSpace: 'nowrap',
            }}
          >
            <span style={{
              padding: '2px 6px', borderRadius: 3,
              background: `${SCANNER_COLORS[s.scannerType]}22`,
              color: SCANNER_COLORS[s.scannerType],
              fontSize: 10, fontWeight: 700,
            }}>
              {s.scannerType}
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {s.marketQuestion.slice(0, 50)}{s.marketQuestion.length > 50 ? '…' : ''}
            </span>
            <span style={{ color: s.direction === 'YES' ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
              {s.direction}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {s.confidence}% conf
            </span>
            <span style={{ color: 'var(--border)' }}>│</span>
          </span>
        ))}
      </div>
    </div>
  );
}
