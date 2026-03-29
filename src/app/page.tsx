'use client';
import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import IntelSidebar from '@/components/layout/IntelSidebar';
import SignalTicker from '@/components/layout/SignalTicker';
import SignalCard from '@/components/alpha/SignalCard';
import BacktestPanel from '@/components/alpha/BacktestPanel';
import SearchBar from '@/components/shared/SearchBar';
import CategoryFilter from '@/components/shared/CategoryFilter';
import { SkeletonCard } from '@/components/shared/Skeleton';
import type { RankedSignal } from '@/types';

function SportsTab({ signals, loading, scanning, cash }: { signals: RankedSignal[]; loading: boolean; scanning: boolean; cash: number }) {
  const sportsSignals  = signals.filter(s => s.scannerType === 'SPORTS');
  const baseballSignals = signals.filter(s => s.scannerType === 'BASEBALL');

  return (
    <div>
      {/* Baseball / MLB Markets (Primary) */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <div style={{ padding: '4px 16px', borderRadius: 20, background: '#fb923c22', border: '1px solid #fb923c', fontSize: 11, fontWeight: 800, color: '#fb923c', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
            MLB BASEBALL MARKETS
          </div>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
          Structured statistical model: Pythagorean expectation + Log5 matchup formula, starting pitcher ERA/WHIP, team OPS (OBP + SLG), bullpen quality, recent form, home/away splits, and injury-adjusted lineup probability. Every signal shows a transparent probability breakdown.
        </p>
        {loading || scanning ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : baseballSignals.length === 0 ? (
          <div style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid #fb923c33', borderRadius: 10, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No MLB markets currently available on Polymarket. Baseball markets appear during the regular season (April–October). Click <strong style={{ color: 'var(--cyan)' }}>SCAN NOW</strong> to check for new markets.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {baseballSignals.map(s => <SignalCard key={s.id} signal={s} cash={cash} />)}
          </div>
        )}
      </div>

      {/* Other Sports Markets */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <div style={{ padding: '4px 16px', borderRadius: 20, background: '#38bdf822', border: '1px solid #38bdf8', fontSize: 11, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
            OTHER SPORTS — NBA / NFL / NHL / SOCCER
          </div>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
          Injury-adjusted win probability model: player availability, impact scoring, and recent form (last 5 games) compared against current market price to identify mispriced contracts.
        </p>
        {loading || scanning ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : sportsSignals.length === 0 ? (
          <div style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid #38bdf833', borderRadius: 10, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No sports markets found. Polymarket sports coverage varies — click <strong style={{ color: 'var(--cyan)' }}>SCAN NOW</strong> to refresh.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {sportsSignals.map(s => <SignalCard key={s.id} signal={s} cash={cash} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [signals, setSignals] = useState<RankedSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [tab, setTab] = useState<'signals' | 'backtest' | 'sports'>('signals');
  const [portfolio, setPortfolio] = useState<{ cash: number }>({ cash: 10000 });
  const [errors, setErrors] = useState<{ signals?: string; portfolio?: string }>({});

  const runScan = useCallback(async () => {
    setScanning(true);
    setErrors(prev => ({ ...prev, signals: undefined }));
    try {
      const res = await fetch('/api/alpha/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 30 }),
      });
      if (!res.ok) throw new Error(`Scan API returned ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSignals(data.signals || []);
    } catch (err) {
      console.error('[scan] Failed:', err);
      setErrors(prev => ({ ...prev, signals: String(err) }));
    }
    setScanning(false);
  }, []);

  // On mount: load portfolio and run scan automatically
  useEffect(() => {
    setLoading(true);
    Promise.all([
      runScan(),
      fetch('/api/portfolio')
        .then(r => {
          if (!r.ok) throw new Error(`Portfolio API returned ${r.status}`);
          return r.json();
        })
        .then(d => setPortfolio({ cash: d.cash || 10000 }))
        .catch(err => {
          console.error('[portfolio] Failed to load:', err);
          setErrors(prev => ({ ...prev, portfolio: String(err) }));
        }),
    ]).finally(() => setLoading(false));
  }, []);

  const filteredSignals = category !== 'All'
    ? signals.filter(s => s.category?.toLowerCase() === category.toLowerCase())
    : signals;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header onScan={runScan} />

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Main content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 20, minWidth: 0 }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0, flexWrap: 'wrap' }}>
            {[
              { key: 'signals', label: `Signals (${filteredSignals.length})` },
              { key: 'sports', label: 'Sports & MLB' },
              { key: 'backtest', label: 'Track Record' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as typeof tab)}
                style={{
                  padding: '8px 16px', background: 'none', border: 'none',
                  borderBottom: `2px solid ${tab === t.key ? 'var(--cyan)' : 'transparent'}`,
                  color: tab === t.key ? 'var(--cyan)' : 'var(--text-muted)',
                  fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
                  cursor: 'pointer', marginBottom: -1, transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 4 }}>
              <div style={{ width: 180 }}>
                <SearchBar onSearch={setSearch} placeholder="Search..." />
              </div>
              <CategoryFilter selected={category} onChange={setCategory} />
            </div>
          </div>

          {/* Inline error banner */}
          {errors.signals && (
            <div style={{ padding: '10px 14px', background: '#ef444422', border: '1px solid #ef4444', borderRadius: 8, marginBottom: 12, fontSize: 12, color: '#ef4444' }}>
              Scan failed: {errors.signals}
            </div>
          )}
          {/* Signals tab */}
          {tab === 'signals' && (
            <>
              {scanning && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--cyan-dim)', border: '1px solid var(--cyan)', borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--cyan)' }}>
                  <span className="spin">⟳</span>
                  Running 8 strategy scanners across live Polymarket data...
                </div>
              )}
              {filteredSignals.length === 0 && !scanning && !loading ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
                  <p>No signals yet. Click <strong style={{ color: 'var(--cyan)' }}>SCAN NOW</strong> to run the scanners.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                  {scanning && signals.length === 0
                    ? Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)
                    : filteredSignals.map(s => <SignalCard key={s.id} signal={s} cash={portfolio.cash} />)}
                </div>
              )}
            </>
          )}

          {tab === 'sports' && (
            <SportsTab signals={signals} loading={false} scanning={scanning} cash={portfolio.cash} />
          )}

          {tab === 'backtest' && <BacktestPanel />}
        </main>

        {/* Intel Sidebar */}
        <IntelSidebar />
      </div>

      <SignalTicker signals={signals} />
    </div>
  );
}
