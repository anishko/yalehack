'use client';
import { use, useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import IntelSidebar from '@/components/layout/IntelSidebar';
import PriceChart from '@/components/market/PriceChart';
import BetPanel from '@/components/market/BetPanel';
import RiskBadge from '@/components/shared/RiskBadge';
import type { PolymarketMarket } from '@/types';
import Link from 'next/link';

export default function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [market, setMarket] = useState<PolymarketMarket | null>(null);
  const [loading, setLoading] = useState(true);
  const [cash, setCash] = useState(10000);

  useEffect(() => {
    fetch(`/api/markets/${id}`).then(r => r.json()).then(d => { setMarket(d.market); setLoading(false); }).catch(() => setLoading(false));
    fetch('/api/portfolio').then(r => r.json()).then(d => setCash(d.cash || 10000)).catch(() => {});
  }, [id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />
      <div style={{ display: 'flex', flex: 1 }}>
        <main style={{ flex: 1, overflowY: 'auto', padding: 24, maxWidth: 900 }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'var(--text-muted)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
            ← Back to Dashboard
          </Link>

          {loading ? (
            <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading market data...</div>
          ) : !market ? (
            <div style={{ color: 'var(--red)', padding: 40, textAlign: 'center' }}>Market not found</div>
          ) : (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {/* Left column */}
              <div style={{ flex: 2, minWidth: 300 }}>
                {/* Category */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, background: 'var(--cyan-dim)', color: 'var(--cyan)', fontWeight: 700 }}>
                    {market.category || 'General'}
                  </span>
                  <RiskBadge score={market.riskScore ?? 50} size="md" />
                  {market.active && (
                    <span style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                      ACTIVE
                    </span>
                  )}
                </div>

                <h1 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, lineHeight: 1.4 }}>
                  {market.question}
                </h1>

                {market.description && (
                  <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {market.description}
                  </p>
                )}

                {/* Price stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'YES Price', value: market.midPrice !== undefined ? `${(market.midPrice * 100).toFixed(1)}¢` : '—', color: 'var(--green)' },
                    { label: 'Spread', value: market.spread !== undefined ? `${(market.spread * 100).toFixed(2)}%` : '—', color: 'var(--gold)' },
                    { label: 'Volume', value: market.volume ? `$${(market.volume / 1000).toFixed(0)}K` : '—', color: 'var(--cyan)' },
                    { label: 'Liquidity', value: market.liquidity ? `$${(market.liquidity / 1000).toFixed(0)}K` : '—', color: 'var(--text-secondary)' },
                    { label: 'Closes', value: market.endDate ? new Date(market.endDate).toLocaleDateString() : 'Unknown', color: 'var(--text-secondary)' },
                    { label: 'Outcomes', value: market.tokens.length.toString(), color: 'var(--text-secondary)' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                      <div data-mono style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Price chart */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>PRICE HISTORY</h3>
                  <PriceChart history={market.priceHistory || []} />
                </div>

                {/* Outcomes */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>OUTCOMES</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {market.tokens.map(t => (
                      <div key={t.token_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg)', borderRadius: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{t.outcome}</span>
                        {t.price !== undefined && (
                          <span data-mono style={{ fontSize: 14, color: t.outcome === 'Yes' || t.outcome === 'YES' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                            {(t.price * 100).toFixed(1)}¢
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right column: Bet panel */}
              <div style={{ width: 300, minWidth: 280 }}>
                <BetPanel market={market} cash={cash} />
              </div>
            </div>
          )}
        </main>
        <IntelSidebar />
      </div>
    </div>
  );
}
