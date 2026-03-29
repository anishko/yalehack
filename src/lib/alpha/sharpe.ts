// ─── Current 10-year US Treasury yield (risk-free rate) ──────────────────────
// Updated periodically; ~4.4% as of early 2025
export const TREASURY_RATE = 0.044;

// ─── Core metrics ──────────────────────────────────────────────────────────────

export function computeSharpe(returns: number[], riskFreeRate = TREASURY_RATE): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return mean > 0 ? 5.0 : 0;
  const dailyRf = riskFreeRate / 365;
  return Math.round(((mean - dailyRf) / std) * Math.sqrt(365) * 100) / 100;
}

export function computeMaxDrawdown(equityCurve: number[]): number {
  let peak = equityCurve[0];
  let maxDD = 0;
  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return Math.round(maxDD * 10000) / 100;
}

export function computeProfitFactor(trades: Array<{ pnl: number }>): number {
  const grossProfit = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  if (grossLoss === 0) return grossProfit > 0 ? 99 : 0;
  return Math.round((grossProfit / grossLoss) * 100) / 100;
}

export function computeCalmar(totalReturn: number, maxDrawdown: number): number {
  return maxDrawdown > 0 ? Math.round((totalReturn / maxDrawdown) * 100) / 100 : 0;
}

export function computeEquityCurve(
  returns: number[],
  startingCapital = 10000
): Array<{ t: number; equity: number }> {
  let equity = startingCapital;
  const curve = [{ t: 0, equity }];
  returns.forEach((r, i) => {
    equity *= (1 + r);
    curve.push({ t: i + 1, equity: Math.round(equity * 100) / 100 });
  });
  return curve;
}

// ─── Alpha & Beta vs benchmark ─────────────────────────────────────────────────

export function computeBeta(strategyReturns: number[], benchmarkReturns: number[]): number {
  const n = Math.min(strategyReturns.length, benchmarkReturns.length);
  if (n < 2) return 1;
  const strat = strategyReturns.slice(0, n);
  const bench = benchmarkReturns.slice(0, n);

  const meanS = strat.reduce((a, b) => a + b, 0) / n;
  const meanB = bench.reduce((a, b) => a + b, 0) / n;

  let cov = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    cov  += (strat[i] - meanS) * (bench[i] - meanB);
    varB += (bench[i] - meanB) ** 2;
  }
  if (varB === 0) return 1;
  return Math.round((cov / varB) * 1000) / 1000;
}

/** Jensen's Alpha = R_p - [R_f + Beta * (R_m - R_f)]  (annualized %) */
export function computeAlpha(
  strategyReturns: number[],
  benchmarkReturns: number[],
  riskFreeRate = TREASURY_RATE
): number {
  if (strategyReturns.length < 2) return 0;
  const beta = computeBeta(strategyReturns, benchmarkReturns);
  const dailyRf = riskFreeRate / 365;

  const meanS = strategyReturns.reduce((a, b) => a + b, 0) / strategyReturns.length;
  const meanB = benchmarkReturns.slice(0, strategyReturns.length).reduce((a, b) => a + b, 0) / strategyReturns.length;

  // Annualise
  const annualS = meanS * 365;
  const annualB = meanB * 365;
  const annualRf = riskFreeRate;

  const alpha = annualS - (annualRf + beta * (annualB - annualRf));
  return Math.round(alpha * 10000) / 100; // as %
}

/** Information Ratio = (strategy return - benchmark return) / tracking error */
export function computeInformationRatio(
  strategyReturns: number[],
  benchmarkReturns: number[]
): number {
  const n = Math.min(strategyReturns.length, benchmarkReturns.length);
  if (n < 2) return 0;
  const active = strategyReturns.slice(0, n).map((r, i) => r - benchmarkReturns[i]);
  const meanActive = active.reduce((a, b) => a + b, 0) / n;
  const te = Math.sqrt(active.reduce((s, r) => s + (r - meanActive) ** 2, 0) / (n - 1));
  if (te === 0) return 0;
  return Math.round((meanActive / te) * Math.sqrt(252) * 100) / 100;
}

/** Treynor Ratio = (R_p - R_f) / Beta */
export function computeTreynorRatio(
  strategyReturns: number[],
  beta: number,
  riskFreeRate = TREASURY_RATE
): number {
  if (beta === 0 || strategyReturns.length < 2) return 0;
  const meanR = strategyReturns.reduce((a, b) => a + b, 0) / strategyReturns.length;
  const annualR = meanR * 365;
  return Math.round(((annualR - riskFreeRate) / Math.abs(beta)) * 100) / 100;
}

// ─── Confidence Intervals ──────────────────────────────────────────────────────

const Z_SCORES: Record<number, number> = { 80: 1.282, 90: 1.645, 95: 1.960, 99: 2.576 };

export function computeConfidenceInterval(
  returns: number[],
  level: number = 95
): { level: number; lower: number; upper: number; z: number } {
  if (returns.length < 2) return { level, lower: 0, upper: 0, z: 0 };
  const n = returns.length;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1));
  const z = Z_SCORES[level] ?? 1.96;
  const margin = z * (std / Math.sqrt(n));
  return {
    level,
    lower: Math.round((mean - margin) * 10000) / 100,
    upper: Math.round((mean + margin) * 10000) / 100,
    z,
  };
}

// ─── S&P 500 benchmark simulation ─────────────────────────────────────────────

/** Generate realistic S&P 500 daily return series for a given number of days.
 *  Uses historical mean ~10.5%/yr, std ~15%/yr with fat-tailed variance. */
export function generateSP500Returns(days: number, seed = 99): number[] {
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
  // Box-Muller for normal distribution
  const randn = () => {
    const u = Math.max(1e-10, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const dailyMean = 0.105 / 365;
  const dailyStd  = 0.15 / Math.sqrt(252);

  return Array.from({ length: days }, () => dailyMean + dailyStd * randn());
}

// ─── Brier Score ──────────────────────────────────────────────────────────────

/** Brier Score: (1/N) * sum((predicted_prob - actual_outcome)^2)
 *  Lower = better calibration. Uses signal confidence as predicted_prob
 *  and win (1) / loss (0) as actual_outcome. */
export function computeBrierScore(
  trades: Array<{ pnl: number; confidence: number }>,
): number {
  if (trades.length === 0) return 1;
  const sum = trades.reduce((s, t) => {
    const predicted = t.confidence / 100; // confidence is 0-100, normalise to 0-1
    const actual = t.pnl > 0 ? 1 : 0;
    return s + (predicted - actual) ** 2;
  }, 0);
  return Math.round((sum / trades.length) * 10000) / 10000;
}

// ─── Sortino Ratio ────────────────────────────────────────────────────────────

/** Sortino Ratio = (mean_return - rf) / downside_std * sqrt(365)
 *  Only penalises downside volatility (returns below the mean). */
export function computeSortino(returns: number[], riskFreeRate = TREASURY_RATE): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const dailyRf = riskFreeRate / 365;

  // Downside deviation: std of returns below the mean
  const downsideReturns = returns.filter(r => r < mean);
  if (downsideReturns.length === 0) return mean > 0 ? 5.0 : 0;

  const downsideVariance = downsideReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / downsideReturns.length;
  const downsideStd = Math.sqrt(downsideVariance);
  if (downsideStd === 0) return mean > 0 ? 5.0 : 0;

  return Math.round(((mean - dailyRf) / downsideStd) * Math.sqrt(365) * 100) / 100;
}

// ─── Edge per Dollar ──────────────────────────────────────────────────────────

/** Edge per Dollar = sum(pnl) / sum(position_sizes).
 *  Average return per dollar risked across all trades. */
export function computeEdgePerDollar(
  trades: Array<{ pnl: number; size: number }>,
): number {
  if (trades.length === 0) return 0;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const totalSize = trades.reduce((s, t) => s + t.size, 0);
  if (totalSize === 0) return 0;
  return Math.round((totalPnl / totalSize) * 10000) / 10000;
}

// ─── Monte Carlo Bootstrap ────────────────────────────────────────────────────

export interface MonteCarloResult {
  pValue: number;          // % of shuffles that are still profitable
  percentile5: number;     // 5th percentile total return
  percentile95: number;    // 95th percentile total return
}

/** Reshuffle trade returns 10,000 times. Report p-value and 5th/95th percentile. */
export function computeMonteCarloBootstrap(
  tradeReturns: number[],
  iterations = 10000,
  seed = 42,
): MonteCarloResult {
  if (tradeReturns.length === 0) {
    return { pValue: 1, percentile5: 0, percentile95: 0 };
  }

  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };

  const n = tradeReturns.length;
  const totals: number[] = [];

  for (let iter = 0; iter < iterations; iter++) {
    // Fisher-Yates shuffle on a copy
    const shuffled = tradeReturns.slice();
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Compound total return
    let equity = 1;
    for (const r of shuffled) {
      equity *= (1 + r);
    }
    totals.push(equity - 1);
  }

  totals.sort((a, b) => a - b);

  const profitable = totals.filter(t => t > 0).length;
  const pValue = Math.round((profitable / iterations) * 10000) / 100;
  const p5idx  = Math.floor(iterations * 0.05);
  const p95idx = Math.floor(iterations * 0.95);

  return {
    pValue,
    percentile5:  Math.round(totals[p5idx] * 10000) / 100,
    percentile95: Math.round(totals[p95idx] * 10000) / 100,
  };
}

// ─── Labels / colours ──────────────────────────────────────────────────────────

export function edgeScoreLabel(score: number): string {
  if (score >= 3) return 'Exceptional';
  if (score >= 2) return 'Great';
  if (score >= 1) return 'Solid';
  if (score >= 0) return 'Weak';
  return 'Negative';
}

export function edgeScoreColor(score: number): string {
  if (score >= 3) return '#22c55e';
  if (score >= 2) return '#06b6d4';
  if (score >= 1) return '#eab308';
  return '#ef4444';
}
