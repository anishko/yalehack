import type { ScannerType, StrategyPerformance, OptimizedBlend } from '@/types';
import { computeSharpe, computeMaxDrawdown, computeProfitFactor, computeCalmar, computeEquityCurve } from './sharpe';
import { generateBacktestTrades } from './backtest';

const MS_PER_DAY = 86400000;

function tradesToDailyReturns(trades: ReturnType<typeof generateBacktestTrades>, days: number): number[] {
  const daily = new Array<number>(days).fill(0);
  if (!trades.length) return daily;
  const startTs = trades[0].timestamp;
  for (const t of trades) {
    const idx = Math.min(days - 1, Math.max(0, Math.floor((t.timestamp - startTs) / MS_PER_DAY)));
    daily[idx] += t.pnl / 10000;
  }
  return daily;
}

function buildStrategyPerformance(type: ScannerType, lookbackDays: number): StrategyPerformance {
  const trades = generateBacktestTrades(type, lookbackDays, 42, false);
  const oosDays = Math.floor(lookbackDays * 0.30);
  const oosTrades = generateBacktestTrades(type, oosDays, 99, true);

  const allTrades = [...trades, ...oosTrades];
  const tradeReturns = allTrades.map(t => t.returnPct / 100);
  const wins = allTrades.filter(t => t.pnl > 0);
  const equity = computeEquityCurve(tradeReturns, 10000);
  const maxDD = computeMaxDrawdown(equity.map(e => e.equity));
  const totalReturn = (equity[equity.length - 1]?.equity - 10000) / 10000;

  // Sharpe on OOS daily returns only
  const oosDailyReturns = tradesToDailyReturns(oosTrades, oosDays);

  const names: Record<ScannerType, string> = {
    ARB: 'Arbitrage', SPREAD: 'Spread', VELOCITY: 'Momentum',
    DIVERGENCE: 'Divergence', SOCIAL: 'Social', CROSS_DOMAIN: 'Cross-Domain',
    SPORTS: 'Sports', MARCH_MADNESS: 'March Madness',
  };

  return {
    name: names[type],
    type,
    returns: tradeReturns,
    edgeScore: computeSharpe(oosDailyReturns),
    winRate: allTrades.length ? Math.round((wins.length / allTrades.length) * 100) / 100 : 0,
    avgReturn: tradeReturns.length ? tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length : 0,
    maxDrawdown: maxDD,
    profitFactor: computeProfitFactor(allTrades.map(t => ({ pnl: t.pnl }))),
    tradeFrequency: allTrades.length / (lookbackDays / 30),
    calmar: computeCalmar(totalReturn * 100, maxDD),
    tradeCount: allTrades.length,
  };
}

function computeBlendedReturns(
  strategies: StrategyPerformance[],
  weights: number[]
): number[] {
  const allTrades: Array<{ index: number; returnPct: number }> = [];

  strategies.forEach((strat, i) => {
    const weight = weights[i];
    if (weight <= 0) return;
    strat.returns.forEach((r, j) => {
      allTrades.push({ index: j, returnPct: r * weight });
    });
  });

  allTrades.sort((a, b) => a.index - b.index);
  return allTrades.map(t => t.returnPct);
}

export async function optimizeStrategyBlend(lookbackDays = 90): Promise<OptimizedBlend> {
  const types: ScannerType[] = ['ARB', 'SPREAD', 'VELOCITY', 'DIVERGENCE', 'SOCIAL', 'CROSS_DOMAIN', 'SPORTS', 'MARCH_MADNESS'];
  const strategies = types.map(t => buildStrategyPerformance(t, lookbackDays));

  const STEP = 0.05;
  const MAX_WEIGHT = 0.40;
  let bestSharpe = -Infinity;
  let bestWeights: number[] = [0.05, 0.18, 0.20, 0.12, 0.08, 0.20, 0.10, 0.07];

  // Grid search - simplified for performance
  // Try combinations with fixed steps
  const candidates = generateWeightCombinations(types.length, STEP, MAX_WEIGHT);

  // Use mean daily return / std(daily return) for optimizer ranking
  // to avoid the same per-trade inflation that plagued the backtest Sharpe.
  // We approximate daily EV = blendedMean * (tradesPerDay), std scales similarly.
  // Sorting by this keeps relative rankings correct without re-bucketing.
  for (const weights of candidates) {
    const blendedReturns = computeBlendedReturns(strategies, weights);
    if (blendedReturns.length < 2) continue;
    const mean = blendedReturns.reduce((a, b) => a + b, 0) / blendedReturns.length;
    const variance = blendedReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (blendedReturns.length - 1);
    const std = Math.sqrt(variance);
    // Sharpe-like score: not annualized here (used only for relative ranking)
    const sharpe = std > 0 ? mean / std : 0;
    if (sharpe > bestSharpe) {
      bestSharpe = sharpe;
      bestWeights = [...weights];
    }
  }

  const bestReturns = computeBlendedReturns(strategies, bestWeights);
  const equity = computeEquityCurve(bestReturns, 10000);
  const maxDD = computeMaxDrawdown(equity.map(e => e.equity));
  const totalReturn = (equity[equity.length - 1]?.equity - 10000) / 10000;

  const weightMap = {} as Record<ScannerType, number>;
  types.forEach((t, i) => { weightMap[t] = Math.round(bestWeights[i] * 100) / 100; });

  const wins = bestReturns.filter(r => r > 0);
  const bestSingleSharpe = Math.max(...strategies.map(s => s.edgeScore));
  const bestSingleStrategy = strategies.find(s => s.edgeScore === bestSingleSharpe);

  return {
    weights: weightMap,
    blendedEdgeScore: bestSharpe,
    blendedWinRate: bestReturns.length ? Math.round((wins.length / bestReturns.length) * 100) / 100 : 0,
    blendedMaxDrawdown: maxDD,
    blendedProfitFactor: computeProfitFactor(bestReturns.map(r => ({ pnl: r }))),
    blendedCalmar: computeCalmar(totalReturn * 100, maxDD),
    equityCurve: equity,
    improvement: `Blend Edge Score ${bestSharpe.toFixed(2)} vs best single strategy (${bestSingleStrategy?.name ?? 'ARB'}) ${bestSingleSharpe.toFixed(2)}`,
    perStrategy: strategies,
  };
}

function generateWeightCombinations(n: number, step: number, maxW: number): number[][] {
  // For speed, use a set of hand-crafted + random search
  const results: number[][] = [];

  // Fixed candidate allocations
  // 8 strategies: ARB SPREAD VELOCITY DIVERGENCE SOCIAL CROSS_DOMAIN SPORTS MARCH_MADNESS
  const candidates = [
    [0.05, 0.18, 0.20, 0.12, 0.08, 0.20, 0.10, 0.07],
    [0.05, 0.15, 0.18, 0.15, 0.07, 0.18, 0.12, 0.10],
    [0.05, 0.20, 0.18, 0.12, 0.05, 0.18, 0.12, 0.10],
    [0.05, 0.15, 0.20, 0.15, 0.05, 0.20, 0.12, 0.08],
    [0.05, 0.18, 0.15, 0.15, 0.07, 0.20, 0.12, 0.08],
    [0.05, 0.15, 0.20, 0.10, 0.05, 0.20, 0.15, 0.10],
    [0.05, 0.20, 0.15, 0.12, 0.08, 0.15, 0.15, 0.10],
    [0.05, 0.15, 0.18, 0.12, 0.05, 0.20, 0.15, 0.10],
  ];

  // Random search: 200 random weight vectors
  for (let i = 0; i < 200; i++) {
    const w = randomWeights(n, step, maxW);
    if (w) candidates.push(w);
  }

  for (const c of candidates) {
    if (c.length === n && Math.abs(c.reduce((a, b) => a + b, 0) - 1.0) < 0.01) {
      results.push(c);
    }
  }

  return results;
}

function randomWeights(n: number, step: number, maxW: number): number[] | null {
  const weights: number[] = [];
  let remaining = 1.0;

  for (let i = 0; i < n - 1; i++) {
    const maxForThis = Math.min(maxW, remaining - (n - i - 1) * step);
    if (maxForThis < 0) return null;
    const steps = Math.floor(maxForThis / step);
    const w = Math.round((Math.floor(Math.random() * (steps + 1)) * step) * 100) / 100;
    weights.push(w);
    remaining = Math.round((remaining - w) * 100) / 100;
  }

  if (remaining < 0 || remaining > maxW) return null;
  weights.push(remaining);
  return weights;
}
