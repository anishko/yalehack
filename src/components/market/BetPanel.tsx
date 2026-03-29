'use client';
import { useState } from 'react';
import type { PolymarketMarket, ScannerType } from '@/types';
import { computeOptimalBetSize, DEFAULT_WEIGHTS } from '@/lib/alpha/sizing';
import RiskBadge from '@/components/shared/RiskBadge';

export default function BetPanel({ market, cash = 10000 }: { market: PolymarketMarket; cash?: number }) {
  const [direction, setDirection] = useState<'YES' | 'NO'>('YES');
  const [amount, setAmount] = useState(100);
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const price = direction === 'YES'
    ? (market.midPrice ?? 0.5)
    : 1 - (market.midPrice ?? 0.5);

  const potential = amount / price - amount;
  const kellySignal = {
    id: '',
    scannerType: 'SPREAD' as ScannerType,
    marketId: market.conditionId,
    marketQuestion: market.question,
    direction,
    confidence: 55,
    expectedEdge: 0.03,
    riskScore: market.riskScore ?? 50,
    edgeScore: 1.5,
    summary: '',
    details: '',
    timestamp: Date.now(),
  };
  const kellySize = Math.round(computeOptimalBetSize(kellySignal, cash, DEFAULT_WEIGHTS['SPREAD'], 55));

  const handleBet = async () => {
    setPlacing(true);
    setResult(null);
    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId: market.conditionId,
          marketQuestion: market.question,
          direction,
          amount,
          price,
          strategy: 'SPREAD',
          riskScore: market.riskScore ?? 50,
          category: market.category,
        }),
      });
      const data = await res.json();
      setResult(data.success ? '✓ Position opened!' : data.error || 'Failed');
    } catch {
      setResult('Error placing bet');
    }
    setPlacing(false);
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>Place Bet</h3>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['YES', 'NO'] as const).map(d => (
          <button
            key={d}
            onClick={() => setDirection(d)}
            style={{
              flex: 1, padding: '10px', borderRadius: 8,
              background: direction === d ? (d === 'YES' ? 'var(--green-dim)' : 'var(--red-dim)') : 'var(--bg)',
              border: `1px solid ${direction === d ? (d === 'YES' ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
              color: d === 'YES' ? 'var(--green)' : 'var(--red)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {d} @ {d === 'YES' ? ((market.midPrice ?? 0.5) * 100).toFixed(1) : ((1 - (market.midPrice ?? 0.5)) * 100).toFixed(1)}¢
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Bet Amount ($)</label>
        <input
          type="number"
          value={amount}
          min={10}
          onChange={e => setAmount(Math.max(10, Number(e.target.value)))}
          style={{
            width: '100%', padding: '10px 12px',
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {[25, 50, 100, 250].map(a => (
            <button key={a} onClick={() => setAmount(a)} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11,
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}>
              ${a}
            </button>
          ))}
          <button onClick={() => setAmount(kellySize)} style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 11,
            background: 'var(--cyan-dim)', border: '1px solid var(--cyan)',
            color: 'var(--cyan)', cursor: 'pointer',
          }}>
            Kelly ${kellySize}
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Potential profit</span>
          <span data-mono style={{ fontSize: 13, color: 'var(--green)', fontWeight: 700 }}>+${potential.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Risk Score</span>
          <RiskBadge score={market.riskScore ?? 50} />
        </div>
      </div>

      {result ? (
        <div style={{
          padding: '10px', borderRadius: 8, textAlign: 'center',
          background: result.startsWith('✓') ? 'var(--green-dim)' : 'var(--red-dim)',
          color: result.startsWith('✓') ? 'var(--green)' : 'var(--red)',
          fontSize: 13, fontWeight: 700,
        }}>
          {result}
        </div>
      ) : (
        <button
          onClick={handleBet}
          disabled={placing}
          style={{
            width: '100%', padding: '12px',
            background: direction === 'YES' ? 'var(--green-dim)' : 'var(--red-dim)',
            border: `1px solid ${direction === 'YES' ? 'var(--green)' : 'var(--red)'}`,
            color: direction === 'YES' ? 'var(--green)' : 'var(--red)',
            fontSize: 14, fontWeight: 800, cursor: placing ? 'not-allowed' : 'pointer',
            borderRadius: 8,
          }}
        >
          {placing ? '⟳ Placing...' : `Bet ${direction} — $${amount}`}
        </button>
      )}
    </div>
  );
}
