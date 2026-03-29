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
