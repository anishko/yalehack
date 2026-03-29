'use client';
import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import IntelSidebar from '@/components/layout/IntelSidebar';
import SignalTicker from '@/components/layout/SignalTicker';
import StrategyDashboard from '@/components/strategy/StrategyDashboard';
import SignalCard from '@/components/alpha/SignalCard';
import BacktestPanel from '@/components/alpha/BacktestPanel';
import MarketCard from '@/components/market/MarketCard';
import SearchBar from '@/components/shared/SearchBar';
import CategoryFilter from '@/components/shared/CategoryFilter';
import { SkeletonCard } from '@/components/shared/Skeleton';
import type { RankedSignal, PolymarketMarket } from '@/types';

function SportsTab({ signals, loading, cash }: { signals: RankedSignal[]; loading: boolean; cash: number }) {
  const sportsSignals      = signals.filter(s => s.scannerType === 'SPORTS');
  const marchSignals       = signals.filter(s => s.scannerType === 'MARCH_MADNESS');
  const allSports          = [...marchSignals, ...sportsSignals]; // March Madness first

  return (
    <div>
      {/* March Madness section */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <div style={{ padding: '4px 16px', borderRadius: 20, background: '#fb923c22', border: '1px solid #fb923c', fontSize: 11, fontWeight: 800, color: '#fb923c', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
            🏆 MARCH MADNESS — TOURNAMENT MARKETS
          </div>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
          NCAA tournament-specific signals. Model uses 40yr seed win rates, KenPom-style adjusted efficiency margins, pace-of-play variance, and live injury status — unique depth not available on general platforms.
        </p>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : marchSignals.length === 0 ? (
          <div style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid #fb923c33', borderRadius: 10, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No March Madness markets found in current Polymarket data. Markets appear during tournament (mid-March).
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {marchSignals.map(s => <SignalCard key={s.id} signal={s} cash={cash} />)}
          </div>
        )}
      </div>

      {/* General sports section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <div style={{ padding: '4px 16px', borderRadius: 20, background: '#38bdf822', border: '1px solid #38bdf8', fontSize: 11, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
            🏀 SPORTS — NBA · NFL · MLB · NHL · SOCCER
          </div>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
          Player injury modeling + recent form (last 5 games) → win probability vs current market price. Hook live Rotowire / ESPN injury feed for real-time data.
        </p>
        {loading ? (
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
  const [markets, setMarkets] = useState<PolymarketMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [tab, setTab] = useState<'signals' | 'markets' | 'backtest' | 'sports'>('signals');
  const [portfolio, setPortfolio] = useState<{ cash: number }>({ cash: 10000 });

  const loadMarkets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (category !== 'All') params.set('category', category);
      params.set('limit', '24');
      const res = await fetch(`/api/markets?${params}`);
      const data = await res.json();
      setMarkets(data.markets || []);
    } catch {}
  }, [search, category]);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/alpha/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 30 }),
      });
      const data = await res.json();
      setSignals(data.signals || []);
    } catch {}
    setScanning(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadMarkets(), runScan()]).finally(() => setLoading(false));
    fetch('/api/portfolio').then(r => r.json()).then(d => setPortfolio({ cash: d.cash || 10000 })).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading) loadMarkets();
  }, [search, category]);

  const filteredSignals = category !== 'All'
    ? signals.filter(s => s.category?.toLowerCase() === category.toLowerCase())
    : signals;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header onScan={runScan} />

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Main content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 20, minWidth: 0 }}>
          <StrategyDashboard signals={signals} />

          {/* Tab bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0, flexWrap: 'wrap' }}>
            {[
              { key: 'signals', label: `Signals (${filteredSignals.length})` },
              { key: 'sports', label: '🏀 Sports & March Madness' },
              { key: 'markets', label: `Markets (${markets.length})` },
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
                  <p>No signals found. Click <strong style={{ color: 'var(--cyan)' }}>SCAN NOW</strong> to run the scanners.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                  {loading ? Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)
                    : filteredSignals.map(s => <SignalCard key={s.id} signal={s} cash={portfolio.cash} />)}
                </div>
              )}
            </>
          )}

          {tab === 'sports' && (
            <SportsTab signals={signals} loading={loading} cash={portfolio.cash} />
          )}

          {tab === 'markets' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {loading ? Array(12).fill(0).map((_, i) => <SkeletonCard key={i} />)
                : markets.map(m => <MarketCard key={m.conditionId} market={m} />)}
            </div>
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
