'use client';
import { useEffect, useState } from 'react';
import type { OptimizedBlend, ScannerType, RankedSignal } from '@/types';
import EdgeScoreGauge from './EdgeScoreGauge';
import StrategyCard from './StrategyCard';
import { SkeletonCard } from '@/components/shared/Skeleton';
import Tooltip from '@/components/shared/Tooltip';

export default function StrategyDashboard({ signals }: { signals: RankedSignal[] }) {
  const [blend, setBlend] = useState<OptimizedBlend | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/strategy/performance')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setLoading(false); return; }
        setBlend(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const signalsByType = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.scannerType] = (acc[s.scannerType] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 20,
      marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text)' }}>
            STRATEGY ENGINE
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            8 strategies combined — incl. Sports & March Madness fine-tuning layer.
          </p>
        </div>
        {blend && (
          <div style={{ textAlign: 'right' }}>
            <EdgeScoreGauge score={blend.blendedEdgeScore} size="lg" label="BLENDED SHARPE" />
          </div>
        )}
      </div>

      {/* Blend summary */}
      {blend && (
        <div style={{
          background: 'var(--bg)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <Stat label="Blended Win Rate" value={`${Math.round(blend.blendedWinRate * 100)}%`} color="var(--green)" />
          <Stat label="Worst Case" value={`-${blend.blendedMaxDrawdown.toFixed(1)}%`} color="var(--red)" />
          <Stat label="Profit Factor" value={blend.blendedProfitFactor.toFixed(2)} color="var(--cyan)" />
          <Stat label="Calmar Ratio" value={blend.blendedCalmar.toFixed(2)} color="var(--gold)" />
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 280, textAlign: 'right' }}>
            {blend.improvement}
          </div>
        </div>
      )}

      {/* Strategy cards */}
      {loading ? (
        <div>
          <div style={{ textAlign: 'center', padding: '12px 0 16px', color: 'var(--text-muted)', fontSize: 12 }}>
            <span className="spin" style={{ marginRight: 8 }}>⟳</span>
            Fetching resolved Polymarket contracts and computing real performance...
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {Array(8).fill(0).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      ) : blend ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {blend.perStrategy.map(strategy => (
            <StrategyCard
              key={strategy.type}
              strategy={strategy}
              weight={blend.weights[strategy.type as ScannerType] ?? 0}
              signalCount={signalsByType[strategy.type] ?? 0}
            />
          ))}
        </div>
      ) : null}

      {blend && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <Tooltip content="Strategy Blend: The system combines 6 different strategies. Each wins some of the time. Together, properly weighted, they produce a smoother, higher Edge Score than any single strategy alone.">
            <span style={{ cursor: 'default' }}>
              ⓘ All metrics computed on <strong>real resolved Polymarket contracts</strong> — no simulated data.{' '}
              <strong>Wt</strong> = % of bet sizing.{' '}
              <strong>Sharpe</strong> = per-trade risk-adjusted return.{' '}
              <strong>WR</strong> = Win Rate.{' '}
              Strategies only evaluated on markets matching their category (Sports scanner only runs on sports markets, etc.).
            </span>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div data-mono style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}
