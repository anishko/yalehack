'use client';
import { useState } from 'react';
import type { IntelEntry } from '@/types';

const TIER_COLORS = { VERIFIED: '#22c55e', LIKELY: '#06b6d4', UNCERTAIN: '#eab308', UNVERIFIED: '#ef4444' };

interface IntelInputProps {
  onNewEntry: (entry: IntelEntry) => void;
  relatedMarketQuestion?: string;
}

export default function IntelInput({ onNewEntry, relatedMarketQuestion }: IntelInputProps) {
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [portfolioToast, setPortfolioToast] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!raw.trim()) return;
    setLoading(true);
    setError('');
    setPortfolioToast(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw, marketQuestion: relatedMarketQuestion }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }

      // Show portfolio impact toast if positions were affected
      const impact = data.portfolioImpact;
      if (impact?.updated > 0) {
        const sign = data.riskDelta < 0 ? '↓' : '↑';
        setPortfolioToast(
          `${sign} Risk adjusted on ${impact.updated} position${impact.updated !== 1 ? 's' : ''} (${data.riskDelta > 0 ? '+' : ''}${data.riskDelta})`
        );
        setTimeout(() => setPortfolioToast(null), 6000);
      }

      onNewEntry(data);
      setRaw('');
    } catch {
      setError('Failed to analyze');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        value={raw}
        onChange={e => setRaw(e.target.value)}
        placeholder="Paste a URL, news tip, or type what you know..."
        rows={3}
        style={{
          width: '100%', padding: '10px', resize: 'none',
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 8, color: 'var(--text)', fontSize: 12, outline: 'none',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--cyan)'; }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
      />
      {error && <p style={{ color: 'var(--red)', fontSize: 11, margin: 0 }}>{error}</p>}
      {portfolioToast && (
        <div style={{
          padding: '7px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
          background: portfolioToast.startsWith('↓') ? '#22c55e22' : '#ef444422',
          border: `1px solid ${portfolioToast.startsWith('↓') ? 'var(--green)' : 'var(--red)'}`,
          color: portfolioToast.startsWith('↓') ? 'var(--green)' : 'var(--red)',
        }}>
          {portfolioToast}
        </div>
      )}
      <button
        onClick={handleSubmit}
        disabled={loading || !raw.trim()}
        style={{
          padding: '8px', borderRadius: 8,
          background: loading ? 'var(--bg-hover)' : 'var(--cyan-dim)',
          border: '1px solid var(--cyan)',
          color: 'var(--cyan)', fontSize: 12, fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? '⟳ Analyzing...' : 'Analyze →'}
      </button>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {Object.entries(TIER_COLORS).map(([tier, color]) => (
          <span key={tier} style={{ marginRight: 8 }}>
            <span style={{ color }}>●</span> {tier}
          </span>
        ))}
      </div>
    </div>
  );
}
