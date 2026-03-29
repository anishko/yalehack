'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { RankedSignal } from '@/types';
import RiskBadge from '@/components/shared/RiskBadge';
import { edgeScoreColor } from '@/lib/alpha/sharpe';
import Tooltip from '@/components/shared/Tooltip';

const SCANNER_COLORS: Record<string, string> = {
  ARB: '#22c55e', SPREAD: '#06b6d4', VELOCITY: '#eab308',
  DIVERGENCE: '#ec4899', SOCIAL: '#a78bfa', CROSS_DOMAIN: '#f97316',
  SPORTS: '#38bdf8', MARCH_MADNESS: '#fb923c',
};

const SCANNER_LABELS: Record<string, string> = {
  ARB: 'Arbitrage', SPREAD: 'Spread', VELOCITY: 'Momentum',
  DIVERGENCE: 'Divergence', SOCIAL: 'Social', CROSS_DOMAIN: 'Cross-Domain',
  SPORTS: '🏀 Sports', MARCH_MADNESS: '🏆 March Madness',
};

// Z-score from confidence level using normal approximation (continuous, not a lookup).
// This means every integer from 80–99 produces a distinct value on the slider.
// Formula: inverse normal approximation (Beasley-Springer-Moro)
function zFromLevel(level: number): number {
  const p = level / 100; // e.g. 0.95
  const q = (1 + p) / 2; // one-sided: 0.975 for 95%
  // Rational approximation for inverse normal (accurate to ~4 decimal places)
  const t = Math.sqrt(-2 * Math.log(1 - q));
  const c = [2.515517, 0.802853, 0.010328];
  const d = [1.432788, 0.189269, 0.001308];
  return t - (c[0] + c[1] * t + c[2] * t * t) / (1 + d[0] * t + d[1] * t * t + d[2] * t * t * t);
}

function edgeCI(edge: number, confidence: number, ciLevel: number) {
  const winProb = Math.max(0.01, Math.min(0.99, confidence / 100));
  const stdDev = Math.sqrt(winProb * (1 - winProb));
  const z = zFromLevel(Math.max(80, Math.min(99, ciLevel)));
  const margin = z * stdDev * edge;
  return {
    lower: Math.max(0, Math.round((edge - margin) * 1000) / 10),
    upper: Math.round((edge + margin) * 1000) / 10,
  };
}

export default function SignalCard({ signal, cash = 10000 }: { signal: RankedSignal; cash?: number }) {
  const [betting, setBetting] = useState(false);
  const [betAmount, setBetAmount] = useState(signal.betSize ? Math.round(signal.betSize) : 100);
  const [betResult, setBetResult] = useState<string | null>(null);
  const [ciLevel, setCiLevel] = useState(95);

  const color = SCANNER_COLORS[signal.scannerType];
  const esColor = edgeScoreColor(signal.edgeScore);
  const ci = edgeCI(signal.expectedEdge, signal.confidence, ciLevel);

  const handleBet = async () => {
    setBetting(true);
    try {
      // Use the live market price captured by the scanner
      const mid = signal.marketPrice ?? 0.5;
      const entryPrice = signal.direction === 'YES' ? mid : 1 - mid;

      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId: signal.marketId,
          marketQuestion: signal.marketQuestion,
          direction: signal.direction,
          amount: betAmount,
          price: entryPrice,
          strategy: signal.scannerType,
          riskScore: signal.riskScore,
          category: signal.category,
        }),
      });
      const data = await res.json();
      setBetResult(data.success ? '✓ Bet placed' : data.error || 'Error');
    } catch {
      setBetResult('Error');
    } finally {
      setBetting(false);
      setTimeout(() => setBetResult(null), 3000);
    }
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${color}33`,
      borderRadius: 10,
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            padding: '3px 8px', borderRadius: 4,
            background: `${color}22`, color, fontSize: 10, fontWeight: 800,
          }}>
            {SCANNER_LABELS[signal.scannerType]}
          </span>
          <span style={{
            padding: '3px 8px', borderRadius: 4,
            background: signal.direction === 'YES' ? 'var(--green-dim)' : 'var(--red-dim)',
            color: signal.direction === 'YES' ? 'var(--green)' : 'var(--red)',
            fontSize: 11, fontWeight: 700,
          }}>
            {signal.direction}
          </span>
        </div>
        <RiskBadge score={signal.riskScore} />
      </div>

      {/* Market question */}
      <Link href={`/market/${signal.marketId}`} style={{ textDecoration: 'none' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, cursor: 'pointer' }}>
          {signal.marketQuestion.slice(0, 90)}{signal.marketQuestion.length > 90 ? '…' : ''}
        </p>
      </Link>

      {/* Summary */}
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
        {signal.summary}
      </p>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Tooltip content="Sharpe Ratio for this signal type. Risk-adjusted return vs 4.4% Treasury rate.">
          <StatPill label="Sharpe Ratio" value={signal.edgeScore.toFixed(2)} color={esColor} />
        </Tooltip>
        <Tooltip content="Confidence: How sure the system is. Based on data and track record.">
          <StatPill label="Confidence" value={`${signal.confidence}%`} color="var(--cyan)" />
        </Tooltip>
        <Tooltip content="Profit Potential: Expected return per dollar if this signal plays out.">
          <StatPill label="Profit Potential" value={`+${(signal.expectedEdge * 100).toFixed(1)}%`} color="var(--green)" />
        </Tooltip>
        {signal.relatedAsset && (
          <StatPill label="Asset" value={signal.relatedAsset} color="var(--gold)" />
        )}
      </div>

      {/* Sports context panel */}
      {signal.sportsContext && (
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.05em', marginBottom: 6 }}>
            {signal.sportsContext.sport.toUpperCase()}
            {signal.sportsContext.competition ? ` — ${signal.sportsContext.competition}` : ''}
            {signal.sportsContext.round ? ` · ${signal.sportsContext.round}` : ''}
            {signal.sportsContext.seedMatchup ? ` · Seed ${signal.sportsContext.seedMatchup[0]} vs ${signal.sportsContext.seedMatchup[1]}` : ''}
            {signal.sportsContext.region ? ` · ${signal.sportsContext.region}` : ''}
          </div>
          {signal.sportsContext.efficiencyDelta !== undefined && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
              AdjEM Δ: <span style={{ color: signal.sportsContext.efficiencyDelta >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                {signal.sportsContext.efficiencyDelta >= 0 ? '+' : ''}{signal.sportsContext.efficiencyDelta}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {signal.sportsContext.keyPlayers.map((p, i) => (
              <span key={i} style={{
                fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                background: p.status === 'HEALTHY' ? '#22c55e22' : p.status === 'OUT' ? '#ef444422' : '#eab30822',
                color: p.status === 'HEALTHY' ? '#22c55e' : p.status === 'OUT' ? '#ef4444' : '#eab308',
              }}>
                {p.name} · {p.status}{p.injuryType ? ` (${p.injuryType})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Probability breakdown panel (sports/NCAA signals) */}
      {signal.sportsExplanation && (
        <ProbabilityBreakdown explanation={signal.sportsExplanation} color={color} />
      )}

      {/* Confidence Interval slider */}
      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            PROFIT RANGE — {ciLevel}% CI
          </span>
          <span style={{ fontSize: 10, color: 'var(--cyan)', fontWeight: 700 }}>z={zFromLevel(ciLevel).toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={80} max={99} step={1}
          value={ciLevel}
          onChange={e => setCiLevel(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--cyan)', cursor: 'pointer', marginBottom: 6 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 800 }}>+{ci.lower}%</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>worst case</div>
          </div>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>← expected profit range →</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 800 }}>+{ci.upper}%</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>best case</div>
          </div>
        </div>
      </div>

      {/* Bet panel */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Bet $</span>
          <input
            type="number"
            value={betAmount}
            onChange={e => setBetAmount(Math.max(10, Number(e.target.value)))}
            style={{
              width: 80, padding: '5px 8px',
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text)', fontSize: 13, outline: 'none',
            }}
          />
          {signal.betSize && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              (Kelly: ${Math.round(signal.betSize)})
            </span>
          )}
        </div>

        {betResult ? (
          <span style={{ fontSize: 12, color: betResult.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
            {betResult}
          </span>
        ) : (
          <button
            onClick={handleBet}
            disabled={betting}
            style={{
              padding: '6px 14px', borderRadius: 7,
              background: signal.direction === 'YES' ? 'var(--green-dim)' : 'var(--red-dim)',
              border: `1px solid ${signal.direction === 'YES' ? 'var(--green)' : 'var(--red)'}`,
              color: signal.direction === 'YES' ? 'var(--green)' : 'var(--red)',
              fontSize: 12, fontWeight: 700, cursor: betting ? 'not-allowed' : 'pointer',
            }}
          >
            {betting ? '⟳' : `Bet ${signal.direction}`}
          </button>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div data-mono style={{ fontSize: 12, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

function ProbabilityBreakdown({ explanation, color }: { explanation: RankedSignal['sportsExplanation']; color: string }) {
  if (!explanation) return null;
  const { baseProbability, marketImpliedProbability, adjustments, finalProbability, edgePoints, confidenceReason, riskReason } = explanation;
  const edgeColor = edgePoints >= 0 ? 'var(--green)' : 'var(--red)';

  return (
    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: '0.06em', marginBottom: 8 }}>
        PROBABILITY BREAKDOWN
      </div>

      {/* Base → Final bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{(baseProbability * 100).toFixed(1)}%</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Base</div>
        </div>
        <div style={{ flex: 1, margin: '0 10px', position: 'relative', height: 4, background: 'var(--border)', borderRadius: 2 }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, height: 4, borderRadius: 2,
            width: `${Math.min(100, finalProbability * 100)}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
          }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color }}>{(finalProbability * 100).toFixed(1)}%</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Model</div>
        </div>
      </div>

      {/* Market comparison */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, padding: '4px 8px', background: `${edgeColor}11`, borderRadius: 6, border: `1px solid ${edgeColor}33` }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          Market: {(marketImpliedProbability * 100).toFixed(1)}%
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, color: edgeColor }}>
          Edge: {edgePoints >= 0 ? '+' : ''}{edgePoints.toFixed(1)}pp
        </span>
      </div>

      {/* Adjustment factors */}
      {adjustments.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {adjustments.map((adj, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '3px 0', borderBottom: i < adjustments.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>{adj.label}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.3 }}>{adj.reason}</div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 800, marginLeft: 8, whiteSpace: 'nowrap',
                color: adj.delta >= 0 ? 'var(--green)' : 'var(--red)',
              }}>
                {adj.delta >= 0 ? '+' : ''}{(adj.delta * 100).toFixed(1)}pp
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Confidence & risk reasons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {confidenceReason && confidenceReason !== 'standard model output' && (
          <div style={{ fontSize: 9, color: 'var(--cyan)', background: 'var(--cyan-dim)', padding: '2px 6px', borderRadius: 4 }}>
            {confidenceReason}
          </div>
        )}
        {riskReason && riskReason !== 'no elevated risk factors' && (
          <div style={{ fontSize: 9, color: '#eab308', background: '#eab30811', padding: '2px 6px', borderRadius: 4 }}>
            {riskReason}
          </div>
        )}
      </div>
    </div>
  );
}
