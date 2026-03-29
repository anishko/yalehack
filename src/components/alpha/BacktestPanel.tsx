'use client';
import { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, LineChart, Line, Tooltip as RechartTooltip, XAxis, YAxis, Legend } from 'recharts';
import type { BacktestResult } from '@/types';
import { edgeScoreColor } from '@/lib/alpha/sharpe';


export default function BacktestPanel() {
  const strategy = 'BLENDED';
  const [days, setDays] = useState(90);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Live demo state
  const [demoActive, setDemoActive] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const demoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runBacktest = async () => {
    stopDemo();
    setLoading(true);
    try {
      const res = await fetch('/api/alpha/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scannerType: strategy, lookbackDays: days }),
      });
      const data = await res.json();
      setResult(data);
      setDemoStep(0);
    } catch {}
    setLoading(false);
  };

  const startDemo = () => {
    if (!result || result.equityCurve.length < 2) return;
    setDemoStep(0);
    setDemoActive(true);
  };

  const stopDemo = () => {
    setDemoActive(false);
    if (demoRef.current) clearInterval(demoRef.current);
    demoRef.current = null;
  };

  useEffect(() => {
    if (!demoActive || !result) return;
    const total = result.equityCurve.length;
    demoRef.current = setInterval(() => {
      setDemoStep(prev => {
        if (prev >= total - 1) {
          stopDemo();
          return total - 1;
        }
        return prev + 1;
      });
    }, 30);
    return () => { if (demoRef.current) clearInterval(demoRef.current); };
  }, [demoActive, result]);

  // Re-run backtest when strategy or lookback days change
  useEffect(() => { runBacktest(); }, [strategy, days]);

  const esColor = result ? edgeScoreColor(result.edgeScore) : 'var(--text-muted)';

  // Merge equity curves for chart (sliced to demoStep if demo active)
  const curveLength = result?.equityCurve.length ?? 0;
  const displayLength = demoActive ? demoStep + 1 : curveLength;
  const chartData = result
    ? result.equityCurve.slice(0, displayLength).map((pt, i) => ({
        t: pt.t,
        strategy: pt.equity,
        benchmark: result.benchmarkEquityCurve[i]?.equity ?? undefined,
      }))
    : [];

  const demoProgress = curveLength > 1 ? Math.round((displayLength / curveLength) * 100) : 0;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: '0.05em' }}>TRACK RECORD</h3>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Simulated performance vs S&P 500</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, outline: 'none', cursor: 'pointer' }}
          >
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button
            onClick={runBacktest}
            disabled={loading}
            style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--cyan-dim)', border: '1px solid var(--cyan)', color: 'var(--cyan)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            {loading ? '⟳' : 'Run'}
          </button>
          {result && !demoActive && (
            <button
              onClick={startDemo}
              style={{ padding: '6px 14px', borderRadius: 6, background: '#a78bfa22', border: '1px solid #a78bfa', color: '#a78bfa', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              ▶ Live Demo
            </button>
          )}
          {demoActive && (
            <button
              onClick={stopDemo}
              style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--red-dim)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              ■ Stop
            </button>
          )}
        </div>
      </div>

      {/* Demo progress bar */}
      {demoActive && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${demoProgress}%`, background: '#a78bfa', borderRadius: 2, transition: 'width 30ms linear' }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            Day {displayLength} / {curveLength} — {demoProgress}%
          </div>
        </div>
      )}

      {result && (
        <>
          {/* Walk-forward note */}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, padding: '6px 10px', background: 'var(--bg)', borderRadius: 6, borderLeft: '3px solid var(--cyan)' }}>
            Sharpe ratio computed on <strong style={{ color: 'var(--cyan)' }}>out-of-sample holdout (last 30%)</strong> — in-sample shown for reference only. No look-ahead bias.
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
            {[
              { label: 'Sharpe (OOS)', value: result.edgeScore.toFixed(2), color: esColor },
              { label: 'Sharpe (IS)', value: result.inSampleEdgeScore?.toFixed(2) ?? '—', color: 'var(--text-muted)' },
              { label: 'Win Rate', value: `${result.winRate}%`, color: 'var(--green)' },
              { label: 'ROI', value: `${result.totalReturn >= 0 ? '+' : ''}${result.totalReturn.toFixed(1)}%`, color: result.totalReturn >= 0 ? 'var(--green)' : 'var(--red)' },
              { label: 'Max Drawdown', value: `-${result.maxDrawdown.toFixed(1)}%`, color: 'var(--red)' },
              { label: 'Profit Factor', value: result.profitFactor.toFixed(2), color: 'var(--cyan)' },
              { label: 'Profit / Vol', value: result.profitVolatility?.toFixed(2) ?? '—', color: 'var(--cyan)' },
              { label: 'Sortino Ratio', value: result.sortinoRatio?.toFixed(2) ?? '—', color: 'var(--cyan)' },
              { label: 'Total Trades', value: result.totalTrades.toString(), color: 'var(--text)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>
                <div data-mono style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Equity curve chart */}
          {chartData.length > 2 && (
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="t" hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  <RechartTooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, name: string) => [`$${v.toFixed(2)}`, name === 'strategy' ? 'Strategy' : 'S&P 500']}
                    labelFormatter={() => ''}
                  />
                  <Legend
                    iconType="line"
                    formatter={(value) => value === 'strategy' ? 'Strategy' : 'S&P 500'}
                    wrapperStyle={{ fontSize: 10, color: 'var(--text-muted)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="strategy"
                    stroke={result.totalReturn >= 0 ? 'var(--green)' : 'var(--red)'}
                    dot={false}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    stroke="var(--text-muted)"
                    dot={false}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
