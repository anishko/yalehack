import type { StrategyPerformance, ScannerType } from '@/types';
import { edgeScoreColor } from '@/lib/alpha/sharpe';
import Tooltip from '@/components/shared/Tooltip';

const SCANNER_COLORS: Record<ScannerType, string> = {
  ARB: '#22c55e', SPREAD: '#06b6d4', VELOCITY: '#eab308',
  DIVERGENCE: '#ec4899', SOCIAL: '#a78bfa', CROSS_DOMAIN: '#f97316',
  SPORTS: '#38bdf8', MARCH_MADNESS: '#fb923c',
};

const SCANNER_DESCRIPTIONS: Record<ScannerType, string> = {
  ARB: 'Sum-to-one arbitrage — near-guaranteed profit when YES+NO prices < $0.99',
  SPREAD: 'Wide bid-ask spread — capture market-making edge by sitting in the middle',
  VELOCITY: 'Price momentum — markets that moved >5% recently with trend continuation',
  DIVERGENCE: 'Cross-market mispricing — multi-outcome markets that don\'t sum to 1.0',
  SOCIAL: 'News/Reddit sentiment gap — social signal vs market price divergence',
  CROSS_DOMAIN: 'Finance↔Polymarket — stock/crypto moves not priced into linked markets',
  SPORTS: 'Player injury modeling + recent form → win probability vs market price',
  MARCH_MADNESS: '40yr seed win rates + KenPom efficiency + injury impact — tournament-specific fine-tuning',
};

export default function StrategyCard({
  strategy,
  weight,
  signalCount,
}: {
  strategy: StrategyPerformance;
  weight: number;
  signalCount: number;
}) {
  const color = SCANNER_COLORS[strategy.type];
  const esColor = edgeScoreColor(strategy.edgeScore);

  return (
    <Tooltip content={SCANNER_DESCRIPTIONS[strategy.type]}>
      <div style={{
        background: 'var(--bg-card)',
        border: `1px solid ${color}33`,
        borderRadius: 10,
        padding: 14,
        cursor: 'default',
        transition: 'border-color 0.15s',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: '0.08em', marginBottom: 2 }}>
              {strategy.name.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {signalCount} signal{signalCount !== 1 ? 's' : ''} today
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div data-mono style={{ fontSize: 22, fontWeight: 800, color: esColor, lineHeight: 1 }}>
              {strategy.edgeScore.toFixed(2)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sharpe Ratio</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Stat label="Win Rate" value={`${Math.round(strategy.winRate * 100)}%`} color="var(--green)" />
          <Stat label="Weight" value={`${Math.round(weight * 100)}%`} color={color} />
          <Stat label="Freq/mo" value={`${Math.round(strategy.tradeFrequency)}`} color="var(--text-secondary)" />
        </div>

        {/* Weight bar */}
        <div style={{ marginTop: 10, height: 3, background: 'var(--border)', borderRadius: 2 }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${weight * 100}%`,
            background: color,
            transition: 'width 0.8s ease',
          }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          {Math.round(weight * 100)}% of bet sizing
        </div>
      </div>
    </Tooltip>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div data-mono style={{ fontSize: 13, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}
