import Link from 'next/link';
import type { PolymarketMarket } from '@/types';
import RiskBadge from '@/components/shared/RiskBadge';

const CATEGORY_COLORS: Record<string, string> = {
  Crypto: '#f97316', Politics: '#3b82f6', Sports: '#22c55e',
  Finance: '#eab308', Tech: '#a78bfa', Geopolitics: '#ef4444', General: '#6b7280',
};

export default function MarketCard({ market }: { market: PolymarketMarket }) {
  const mid = market.midPrice;
  const spread = market.spread;
  const color = CATEGORY_COLORS[market.category || 'General'] || '#6b7280';
  const vol = market.volume ? `$${(market.volume / 1000).toFixed(0)}K vol` : '';

  return (
    <Link href={`/market/${market.conditionId}`} style={{ textDecoration: 'none' }}>
      <div className="card-hover" style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 14,
        cursor: 'pointer',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {/* Category + Risk */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            padding: '2px 8px', borderRadius: 4,
            background: `${color}22`, color, fontSize: 10, fontWeight: 700,
          }}>
            {market.category || 'General'}
          </span>
          <RiskBadge score={market.riskScore ?? 50} />
        </div>

        {/* Question */}
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, flex: 1 }}>
          {market.question.slice(0, 80)}{market.question.length > 80 ? '…' : ''}
        </p>

        {/* Price + Stats */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            {mid !== undefined ? (
              <>
                <div data-mono style={{ fontSize: 20, fontWeight: 800, color: mid > 0.5 ? 'var(--green)' : 'var(--red)' }}>
                  {(mid * 100).toFixed(1)}¢
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>YES price</div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>—</div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            {spread !== undefined && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Spread: <span data-mono style={{ color: spread > 0.05 ? 'var(--gold)' : 'var(--text-secondary)' }}>
                  {(spread * 100).toFixed(1)}%
                </span>
              </div>
            )}
            {vol && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{vol}</div>}
          </div>
        </div>
      </div>
    </Link>
  );
}
