'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import IntelSidebar from '@/components/layout/IntelSidebar';
import EquityCurve from '@/components/portfolio/EquityCurve';
import PositionRow from '@/components/portfolio/PositionRow';
import EdgeScoreGauge from '@/components/strategy/EdgeScoreGauge';
import type { PortfolioStats, TradeRecord } from '@/types';

export default function PortfolioPage() {
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [history, setHistory] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const [statsRes, histRes] = await Promise.allSettled([
      fetch('/api/portfolio').then(r => r.json()),
      fetch('/api/portfolio/history').then(r => r.json()),
    ]);
    if (statsRes.status === 'fulfilled') setStats(statsRes.value);
    if (histRes.status === 'fulfilled') setHistory(histRes.value.trades || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleClose = (id: string) => {
    loadData();
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Header />
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading portfolio...</div>
      </div>
    );
  }

  const pnl = stats?.totalPnl ?? 0;
  const pnlPct = stats?.totalPnlPct ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />
      <div style={{ display: 'flex', flex: 1 }}>
        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <h1 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, letterSpacing: '0.05em' }}>PORTFOLIO</h1>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total Value', value: `$${(stats?.totalValue ?? 10000).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: 'var(--text)' },
              { label: 'Cash Available', value: `$${(stats?.cash ?? 10000).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: 'var(--cyan)' },
              { label: 'Invested', value: `$${(stats?.invested ?? 0).toFixed(2)}`, color: 'var(--text-secondary)' },
              { label: 'Total P&L', value: `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`, color: pnl >= 0 ? 'var(--green)' : 'var(--red)' },
              { label: 'P&L %', value: `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%`, color: pnlPct >= 0 ? 'var(--green)' : 'var(--red)' },
              { label: 'Win Rate', value: `${stats?.winRate ?? 0}%`, color: 'var(--green)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                <div data-mono style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Edge Score + Equity Curve */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, marginBottom: 20 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EdgeScoreGauge score={stats?.edgeScore ?? 0} size="lg" label="SHARPE RATIO" />
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>EQUITY CURVE</h3>
              <EquityCurve data={stats?.equityCurve ?? []} />
            </div>
          </div>

          {/* Open positions */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>
              Open Positions ({stats?.positions.length ?? 0})
            </h3>
            {!stats?.positions.length ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No open positions. Head to the dashboard to find signals and place bets.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Market', 'Dir', 'Strategy', 'Entry', 'Current', 'P&L', 'Risk', 'Action'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.positions.map(p => (
                      <PositionRow key={p.id} position={p} onClose={handleClose} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Trade history */}
          {history.length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>
                Trade History ({history.length})
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Market', 'Dir', 'Entry', 'Exit', 'P&L', 'Return'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 20).map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text)' }}>
                          {t.marketQuestion.slice(0, 50)}…
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: t.direction === 'YES' ? 'var(--green)' : 'var(--red)' }}>{t.direction}</span>
                        </td>
                        <td style={{ padding: '8px 12px' }} data-mono>
                          <span style={{ fontSize: 11 }}>{(t.entry * 100).toFixed(1)}¢</span>
                        </td>
                        <td style={{ padding: '8px 12px' }} data-mono>
                          <span style={{ fontSize: 11 }}>{(t.exit * 100).toFixed(1)}¢</span>
                        </td>
                        <td style={{ padding: '8px 12px' }} data-mono>
                          <span style={{ fontSize: 12, fontWeight: 700, color: t.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px' }} data-mono>
                          <span style={{ fontSize: 11, color: t.pnlPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
        <IntelSidebar />
      </div>
    </div>
  );
}
