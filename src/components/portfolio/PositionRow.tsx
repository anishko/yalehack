'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Position } from '@/types';
import RiskBadge from '@/components/shared/RiskBadge';

const SCANNER_COLORS: Record<string, string> = {
  ARB: '#22c55e', SPREAD: '#06b6d4', VELOCITY: '#eab308',
  DIVERGENCE: '#ec4899', SOCIAL: '#a78bfa', CROSS_DOMAIN: '#f97316',
};

export default function PositionRow({ position, onClose }: { position: Position; onClose: (id: string) => void }) {
  const [closing, setClosing] = useState(false);

  const handleClose = async () => {
    setClosing(true);
    const res = await fetch(`/api/portfolio/${position.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) onClose(position.id);
    else setClosing(false);
  };

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '10px 12px' }}>
        <Link href={`/market/${position.marketId}`} style={{ textDecoration: 'none', color: 'var(--text)', fontSize: 12, fontWeight: 500 }}>
          {position.marketQuestion.slice(0, 55)}{position.marketQuestion.length > 55 ? '…' : ''}
        </Link>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{
          padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          background: position.direction === 'YES' ? 'var(--green-dim)' : 'var(--red-dim)',
          color: position.direction === 'YES' ? 'var(--green)' : 'var(--red)',
        }}>
          {position.direction}
        </span>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{
          padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          background: `${SCANNER_COLORS[position.strategy] || '#888'}22`,
          color: SCANNER_COLORS[position.strategy] || '#888',
        }}>
          {position.strategy}
        </span>
      </td>
      <td style={{ padding: '10px 12px' }} data-mono>
        <span style={{ fontSize: 12 }}>{(position.entry * 100).toFixed(1)}¢</span>
      </td>
      <td style={{ padding: '10px 12px' }} data-mono>
        <span style={{ fontSize: 12 }}>{(position.current * 100).toFixed(1)}¢</span>
      </td>
      <td style={{ padding: '10px 12px' }} data-mono>
        <span style={{ fontSize: 12, fontWeight: 700, color: position.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
        </span>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <RiskBadge score={position.riskScore} />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <button
          onClick={handleClose}
          disabled={closing}
          style={{
            padding: '4px 12px', borderRadius: 6,
            background: 'var(--red-dim)', border: '1px solid var(--red)',
            color: 'var(--red)', fontSize: 11, cursor: closing ? 'not-allowed' : 'pointer',
          }}
        >
          {closing ? '⟳' : 'Close'}
        </button>
      </td>
    </tr>
  );
}
