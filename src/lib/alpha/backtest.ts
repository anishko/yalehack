import type { ScannerType, BacktestResult, BacktestTrade } from '@/types';
import {
  computeSharpe, computeMaxDrawdown, computeProfitFactor, computeCalmar, computeEquityCurve,
  computeBeta, computeAlpha, computeInformationRatio, computeTreynorRatio,
  computeConfidenceInterval, generateSP500Returns, TREASURY_RATE,
} from './sharpe';

// ─── Strategy configurations ──────────────────────────────────────────────────
// Realistic prediction-market margins. Polymarket edges are thin — typical
// winning trades yield 0.5–2%, not 3–6%.  Win rates above 70% are only
// sustainable for near-arb strategies with very low trade frequency.

interface StrategyConfig {
  winRate: number;
  avgWin: number;      // fractional return on position size (e.g. 0.012 = 1.2%)
  avgLoss: number;
  tradesPerMonth: number;
  categories: string[];
}

const STRATEGY_CONFIGS: Record<ScannerType, StrategyConfig> = {
  ARB:          { winRate: 0.91, avgWin: 0.010, avgLoss: 0.003, tradesPerMonth: 2,  categories: ['Finance', 'Crypto', 'Politics'] },
  SPREAD:       { winRate: 0.58, avgWin: 0.014, avgLoss: 0.012, tradesPerMonth: 12, categories: ['Sports', 'Finance', 'Politics', 'Crypto'] },
  VELOCITY:     { winRate: 0.52, avgWin: 0.018, avgLoss: 0.017, tradesPerMonth: 8,  categories: ['Crypto', 'Finance', 'Politics'] },
  DIVERGENCE:   { winRate: 0.63, avgWin: 0.016, avgLoss: 0.010, tradesPerMonth: 4,  categories: ['Politics', 'Finance', 'Crypto'] },
  SOCIAL:       { winRate: 0.50, avgWin: 0.020, avgLoss: 0.019, tradesPerMonth: 14, categories: ['Politics', 'Crypto', 'Sports', 'General'] },
  CROSS_DOMAIN: { winRate: 0.57, avgWin: 0.017, avgLoss: 0.013, tradesPerMonth: 6,  categories: ['Finance', 'Crypto', 'Geopolitics'] },
  // Fine-tuned niche strategies — higher edge because of proprietary data depth
  SPORTS:       { winRate: 0.60, avgWin: 0.019, avgLoss: 0.014, tradesPerMonth: 10, categories: ['Sports', 'NBA', 'NFL', 'Soccer'] },
  MARCH_MADNESS:{ winRate: 0.64, avgWin: 0.022, avgLoss: 0.013, tradesPerMonth: 18, categories: ['NCAA', 'Basketball', 'March Madness'] },
};

// ─── Walk-forward parameters ──────────────────────────────────────────────────
// In-sample: first IS_SPLIT of period (used to "fit" the strategy — not shown as Sharpe)
// Out-of-sample: remaining (1-IS_SPLIT) of period — the honest reported Sharpe
const IS_SPLIT = 0.70;
// OOS degradation: strategies decay when market participants adapt.
// Win rate drops ~8%, avg win shrinks ~10% out-of-sample.
const OOS_WIN_RATE_FACTOR = 0.92;
const OOS_RETURN_FACTOR   = 0.90;

// ─── Seeded PRNG ──────────────────────────────────────────────────────────────
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Trade generator ─────────────────────────────────────────────────────────
// isOOS: applies degradation factors to simulate out-of-sample performance decay
export function generateBacktestTrades(
  strategy: ScannerType,
  lookbackDays: number,
  seed = 42,
  isOOS = false,
): BacktestTrade[] {
  const config = STRATEGY_CONFIGS[strategy];
  const totalTrades = Math.round((config.tradesPerMonth / 30) * lookbackDays);
  const rand = seededRandom(seed + strategy.charCodeAt(0));

  const effectiveWinRate = isOOS
    ? config.winRate * OOS_WIN_RATE_FACTOR
    : config.winRate;
  const returnScale = isOOS ? OOS_RETURN_FACTOR : 1.0;

  const trades: BacktestTrade[] = [];
  // Use a fixed epoch so timestamps are deterministic (no Date.now() leakage)
  const fixedEpoch = 1700000000000; // Nov 2023 anchor — never changes
  const startTime = fixedEpoch - lookbackDays * 86400000;

  for (let i = 0; i < totalTrades; i++) {
    const isWin = rand() < effectiveWinRate;
    const baseReturn = isWin
      ? config.avgWin  * (0.6 + rand() * 0.8) * returnScale
      : -config.avgLoss * (0.6 + rand() * 0.8);

    // Mild variance on top
    const returnPct = baseReturn * (0.85 + rand() * 0.30);
    const entry = 0.3 + rand() * 0.4;
    const exit = isWin
      ? entry + Math.abs(returnPct)
      : entry - Math.abs(returnPct);
    const size = 100 + rand() * 400;

    const category = config.categories[Math.floor(rand() * config.categories.length)];

    trades.push({
      timestamp: startTime + (i / totalTrades) * lookbackDays * 86400000,
      market: `Market #${Math.floor(rand() * 1000)}`,
      direction: rand() > 0.5 ? 'YES' : 'NO',
      entry: Math.round(entry * 1000) / 1000,
      exit: Math.round(Math.max(0.01, Math.min(0.99, exit)) * 1000) / 1000,
      returnPct: Math.round(returnPct * 10000) / 100,
      pnl: Math.round(size * returnPct * 100) / 100,
      strategy,
      category: category as never,
    });
  }

  return trades;
}

// ─── Daily return aggregation ─────────────────────────────────────────────────
// Converts trade list → daily P&L array of length `days`.
// Zero-return days (no trades) are explicitly included — this is what prevents
// the Sharpe ratio from being inflated by treating per-trade returns as daily.
function tradesToDailyReturns(
  trades: BacktestTrade[],
  days: number,
  startingCapital = 10000,
): number[] {
  const daily = new Array<number>(days).fill(0);
  if (!trades.length) return daily;

  const startTs = trades[0].timestamp;
  for (const trade of trades) {
    const dayIdx = Math.min(days - 1, Math.max(0,
      Math.floor((trade.timestamp - startTs) / 86400000),
    ));
    daily[dayIdx] += trade.pnl / startingCapital;
  }
  return daily;
}

// ─── Main backtest ────────────────────────────────────────────────────────────
export function computeBacktest(
  strategy: ScannerType | 'BLENDED',
  lookbackDays: number,
  weights?: Record<string, number>,
): BacktestResult {
  const isCutoffDays = Math.floor(lookbackDays * IS_SPLIT);
  const oosDays      = lookbackDays - isCutoffDays;

  // ── Generate trades ───────────────────────────────────────────────────────
  let isTrades: BacktestTrade[];
  let oosTrades: BacktestTrade[];

  if (strategy === 'BLENDED') {
    const allTypes: ScannerType[] = ['ARB', 'SPREAD', 'VELOCITY', 'DIVERGENCE', 'SOCIAL', 'CROSS_DOMAIN'];
    const defaultWeights = { ARB: 0.05, SPREAD: 0.20, VELOCITY: 0.25, DIVERGENCE: 0.15, SOCIAL: 0.10, CROSS_DOMAIN: 0.25 };
    const w = weights || defaultWeights;

    isTrades = allTypes.flatMap(type => {
      const wt = w[type] || 0;
      if (!wt) return [];
      return generateBacktestTrades(type, isCutoffDays, 42, false)
        .map(t => ({ ...t, returnPct: t.returnPct * wt, pnl: t.pnl * wt }));
    }).sort((a, b) => a.timestamp - b.timestamp);

    oosTrades = allTypes.flatMap(type => {
      const wt = w[type] || 0;
      if (!wt) return [];
      return generateBacktestTrades(type, oosDays, 99, true)  // different seed, OOS degraded
        .map(t => ({ ...t, returnPct: t.returnPct * wt, pnl: t.pnl * wt }));
    }).sort((a, b) => a.timestamp - b.timestamp);
  } else {
    isTrades  = generateBacktestTrades(strategy, isCutoffDays, 42, false);
    oosTrades = generateBacktestTrades(strategy, oosDays,      99, true);
  }

  const allTrades = [...isTrades, ...oosTrades];

  if (!allTrades.length) {
    return {
      edgeScore: 0, inSampleEdgeScore: 0, winRate: 0, profitFactor: 0, calmar: 0, maxDrawdown: 0,
      totalTrades: 0, wins: 0, losses: 0, avgWin: 0, avgLoss: 0, totalReturn: 0,
      alpha: 0, beta: 1, benchmarkReturn: 0, informationRatio: 0, treynorRatio: 0,
      treasuryRate: TREASURY_RATE,
      benchmarkEquityCurve: [{ t: 0, equity: 10000 }],
      confidenceInterval: { level: 95, lower: 0, upper: 0, z: 1.96 },
      equityCurve: [{ t: 0, equity: 10000 }],
      categoryBreakdown: [],
      trades: [],
    };
  }

  // ── Equity curve (per-trade compounding — visual only) ────────────────────
  const allReturns = allTrades.map(t => t.returnPct / 100);
  const equity     = computeEquityCurve(allReturns, 10000);
  const maxDD      = computeMaxDrawdown(equity.map(e => e.equity));
  const totalReturn = (equity[equity.length - 1].equity - 10000) / 10000;

  // ── Daily return series ───────────────────────────────────────────────────
  // IS daily returns — for reference / inSampleEdgeScore only
  const isDailyReturns  = tradesToDailyReturns(isTrades,  isCutoffDays);
  // OOS daily returns — the HONEST Sharpe reported to the user
  const oosDailyReturns = tradesToDailyReturns(oosTrades, oosDays);
  // Full daily returns — for alpha/beta vs benchmark
  const fullDailyReturns = [...isDailyReturns, ...oosDailyReturns];

  // ── Sharpe — out-of-sample only ───────────────────────────────────────────
  const inSampleEdgeScore = computeSharpe(isDailyReturns);
  const edgeScore         = computeSharpe(oosDailyReturns); // reported metric

  // ── S&P 500 benchmark — same total length ─────────────────────────────────
  const benchmarkReturns = generateSP500Returns(lookbackDays);
  const benchmarkEquity  = computeEquityCurve(benchmarkReturns, 10000);
  const benchmarkTotalReturn = (benchmarkEquity[benchmarkEquity.length - 1].equity - 10000) / 10000;

  // ── Alpha / beta (full period for more data points) ───────────────────────
  const beta             = computeBeta(fullDailyReturns, benchmarkReturns);
  const alpha            = computeAlpha(fullDailyReturns, benchmarkReturns);
  const informationRatio = computeInformationRatio(fullDailyReturns, benchmarkReturns);
  const treynorRatio     = computeTreynorRatio(fullDailyReturns, beta);

  // ── CI on OOS daily returns ───────────────────────────────────────────────
  const confidenceInterval = computeConfidenceInterval(oosDailyReturns);

  // ── Win/loss stats (all trades) ───────────────────────────────────────────
  const wins   = allTrades.filter(t => t.pnl > 0);
  const losses = allTrades.filter(t => t.pnl <= 0);

  // ── Category breakdown ────────────────────────────────────────────────────
  const catMap = new Map<string, { trades: BacktestTrade[]; pnl: number }>();
  for (const trade of allTrades) {
    const cat = (trade as BacktestTrade & { category?: string }).category || 'General';
    if (!catMap.has(cat)) catMap.set(cat, { trades: [], pnl: 0 });
    catMap.get(cat)!.trades.push(trade);
    catMap.get(cat)!.pnl += trade.pnl;
  }

  const categoryBreakdown = Array.from(catMap.entries()).map(([category, data]) => ({
    category,
    trades: data.trades.length,
    winRate: Math.round((data.trades.filter(t => t.pnl > 0).length / data.trades.length) * 100),
    pnl: Math.round(data.pnl * 100) / 100,
  }));

  return {
    edgeScore,
    inSampleEdgeScore,
    winRate: Math.round((wins.length / allTrades.length) * 100),
    profitFactor: computeProfitFactor(allTrades.map(t => ({ pnl: t.pnl }))),
    calmar: computeCalmar(totalReturn * 100, maxDD),
    maxDrawdown: maxDD,
    totalTrades: allTrades.length,
    wins: wins.length,
    losses: losses.length,
    avgWin:  wins.length   ? Math.round((wins.reduce((s, t)   => s + t.pnl, 0) / wins.length)   * 100) / 100 : 0,
    avgLoss: losses.length ? Math.round((losses.reduce((s, t) => s + t.pnl, 0) / losses.length) * 100) / 100 : 0,
    totalReturn: Math.round(totalReturn * 10000) / 100,
    alpha,
    beta,
    benchmarkReturn: Math.round(benchmarkTotalReturn * 10000) / 100,
    informationRatio,
    treynorRatio,
    treasuryRate: TREASURY_RATE,
    benchmarkEquityCurve: benchmarkEquity,
    confidenceInterval,
    equityCurve: equity,
    categoryBreakdown,
    trades: allTrades.slice(-50),
  };
}
