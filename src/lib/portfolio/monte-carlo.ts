// ─── Monte Carlo Portfolio Simulation ─────────────────────────────────────────
// Resamples historical trades with replacement to generate forward-looking
// equity paths and probability distributions.

import type { TradeRecord, PortfolioMonteCarloResult } from '@/types';

/**
 * Seeded PRNG (same as used elsewhere in the codebase).
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/**
 * Run Monte Carlo simulation on portfolio trade history.
 *
 * Method: bootstrap resampling with replacement.
 * For each simulation, draw N trades (where N = number of historical trades)
 * from the trade history with replacement. Compound their returns to produce
 * a future equity path. Repeat `numSimulations` times.
 *
 * @param trades - Closed trade records from the portfolio
 * @param numSimulations - Number of simulated futures (default 10,000)
 * @returns Percentiles, profit probability, expected value, and sample paths
 */
export function simulatePortfolioFutures(
  trades: TradeRecord[],
  numSimulations: number = 10_000,
): PortfolioMonteCarloResult {
  if (trades.length === 0) {
    return {
      percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
      profitProbability: 0,
      expectedValue: 0,
      paths: [],
    };
  }

  const rng = seededRandom(42);
  const n = trades.length;

  // Extract fractional returns from each trade
  const tradeReturns = trades.map(t => t.pnlPct / 100);

  // Store final P&L for each simulation
  const finalValues: number[] = new Array(numSimulations);

  // How many sample paths to store for charting (evenly spaced across sims)
  const SAMPLE_PATH_COUNT = 100;
  const sampleInterval = Math.max(1, Math.floor(numSimulations / SAMPLE_PATH_COUNT));
  const samplePaths: number[][] = [];

  for (let sim = 0; sim < numSimulations; sim++) {
    let equity = 1.0; // normalised starting equity
    const isSamplePath = sim % sampleInterval === 0 && samplePaths.length < SAMPLE_PATH_COUNT;
    const path: number[] = isSamplePath ? [equity] : [];

    // Resample n trades with replacement
    for (let step = 0; step < n; step++) {
      const idx = Math.floor(rng() * n);
      equity *= (1 + tradeReturns[idx]);

      if (isSamplePath) {
        path.push(Math.round(equity * 10000) / 10000);
      }
    }

    finalValues[sim] = equity - 1; // total return as fraction

    if (isSamplePath) {
      samplePaths.push(path);
    }
  }

  // Sort for percentile extraction
  finalValues.sort((a, b) => a - b);

  const percentile = (p: number): number => {
    const idx = Math.floor(numSimulations * p);
    return Math.round(finalValues[Math.min(idx, numSimulations - 1)] * 10000) / 100; // as percentage
  };

  const profitable = finalValues.filter(v => v > 0).length;
  const expectedValue = finalValues.reduce((s, v) => s + v, 0) / numSimulations;

  return {
    percentiles: {
      p5: percentile(0.05),
      p25: percentile(0.25),
      p50: percentile(0.50),
      p75: percentile(0.75),
      p95: percentile(0.95),
    },
    profitProbability: Math.round((profitable / numSimulations) * 10000) / 100,
    expectedValue: Math.round(expectedValue * 10000) / 100, // as percentage
    paths: samplePaths,
  };
}
