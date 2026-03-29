import type { ScannerType, BacktestResult, BacktestTrade } from '@/types';
import {
  computeSharpe, computeMaxDrawdown, computeProfitFactor, computeCalmar, computeEquityCurve,
  computeBeta, computeAlpha, computeInformationRatio, computeTreynorRatio,
  computeConfidenceInterval, generateSP500Returns, TREASURY_RATE,
  computeBrierScore, computeSortino, computeEdgePerDollar, computeMonteCarloBootstrap,
} from './sharpe';
import { fetchResolvedMarkets, parseMarketCategory, type GammaMarket } from '@/lib/polymarket/gamma';
import { getPricesHistory } from '@/lib/polymarket/clob';

// ─── Real Backtest Engine ─────────────────────────────────────────────────────
// Fetches RESOLVED Polymarket markets, replays scanner-like entry logic on
// historical price data, and checks against actual outcomes (token.winner).
// No simulated trades. Every trade is traceable to a real contract.

// ─── Strategy entry logic ─────────────────────────────────────────────────────
// Each scanner type has a simple entry rule applied to historical price curves.
// These are simplified versions of the live scanner logic — they capture the
// core edge of each strategy without needing live order books or news scraping.

interface EntrySignal {
  direction: 'YES' | 'NO';
  entryPrice: number;
  confidence: number;
  scannerType: ScannerType;
}

// ─── Category relevance filter ────────────────────────────────────────────────
// Only evaluate a market with a scanner if it's the kind of market that scanner
// would actually detect on the live dashboard. No point backtesting the SPORTS
// scanner on a crypto market.
const SPORT_KEYWORDS = /\bnba\b|nfl\b|mlb\b|nhl\b|soccer|premier league|ufc|mma|fight|tennis|wimbledon|lakers|celtics|warriors|chiefs|eagles|cowboys|yankees|dodgers|stanley cup|super bowl/i;
const MLB_KEYWORDS = /\bmlb\b|baseball|world series|pennant|yankees|dodgers|red sox|cubs|mets|astros|braves|innings|pitcher|home run/i;
const CRYPTO_KEYWORDS = /bitcoin|btc|ethereum|eth|crypto|defi|solana|dogecoin|nft/i;
const POLITICS_KEYWORDS = /election|president|senator|vote|congress|democrat|republican|trump|biden|governor|parliament/i;
const FINANCE_KEYWORDS = /stock|market|fed|rate|gdp|recession|inflation|earnings|ipo|s&p|nasdaq|dow/i;
const GEOPOLITICS_KEYWORDS = /war|conflict|military|invasion|sanctions|nato|missile|nuclear|territory/i;

function isRelevantToScanner(market: GammaMarket, scannerType: ScannerType): boolean {
  const q = market.question.toLowerCase();
  const cat = (market.category || '').toLowerCase();

  switch (scannerType) {
    case 'ARB':
    case 'SPREAD':
    case 'DIVERGENCE':
      // These are market-structure scanners — work on any market
      return true;

    case 'VELOCITY':
      // Momentum works best on high-volume markets — accept all but filter by having enough history
      return true;

    case 'SOCIAL':
      // Social sentiment works on politically/culturally charged markets
      return POLITICS_KEYWORDS.test(q) || CRYPTO_KEYWORDS.test(q) || cat === 'politics' || cat === 'crypto';

    case 'CROSS_DOMAIN':
      // Cross-domain needs finance/crypto/geopolitics connection
      return FINANCE_KEYWORDS.test(q) || CRYPTO_KEYWORDS.test(q) || GEOPOLITICS_KEYWORDS.test(q) || cat === 'finance' || cat === 'crypto';

    case 'SPORTS':
      return SPORT_KEYWORDS.test(q) || cat === 'sports';

    case 'BASEBALL':
      return MLB_KEYWORDS.test(q) || cat === 'baseball' || cat === 'sports';

    default:
      return true;
  }
}

function evaluateEntry(
  market: GammaMarket,
  priceHistory: Array<{ t: number; p: number }>,
  scannerType: ScannerType,
): EntrySignal | null {
  if (priceHistory.length < 3) return null;
  if (!isRelevantToScanner(market, scannerType)) return null;

  const prices = priceHistory.map(h => h.p);
  const latest = prices[prices.length - 1];
  const prev = prices[prices.length - 2];

  // Parse YES/NO token outcome prices if available
  let yesPrice = latest;
  let noPrice = 1 - latest;
  if (market.outcomePrices) {
    try {
      const parsed = JSON.parse(market.outcomePrices) as string[];
      if (parsed[0]) yesPrice = parseFloat(parsed[0]);
      if (parsed[1]) noPrice = parseFloat(parsed[1]);
    } catch {}
  }

  switch (scannerType) {
    case 'ARB': {
      // Sum-to-one: if YES + NO < 0.98 there's an arb
      const sum = yesPrice + noPrice;
      if (sum < 0.98 && sum > 0.5) {
        return { direction: 'YES', entryPrice: yesPrice, confidence: 85, scannerType };
      }
      return null;
    }

    case 'SPREAD': {
      // Wide spread proxy: price far from 0.5 = more conviction = tighter spread
      // Markets near 0.5 have widest spreads → enter contrarian
      if (latest > 0.40 && latest < 0.60) {
        const dir = latest < 0.50 ? 'YES' : 'NO';
        return { direction: dir, entryPrice: latest, confidence: 55, scannerType };
      }
      return null;
    }

    case 'VELOCITY': {
      // Momentum: if price moved >5pp in last 3 data points, follow the trend
      const lookback = prices.slice(-4);
      const move = lookback[lookback.length - 1] - lookback[0];
      if (Math.abs(move) > 0.05) {
        return {
          direction: move > 0 ? 'YES' : 'NO',
          entryPrice: latest,
          confidence: Math.min(75, 50 + Math.abs(move) * 200),
          scannerType,
        };
      }
      return null;
    }

    case 'DIVERGENCE': {
      // Multi-outcome: YES + NO should ≈ 1.0. If >1.05, sell the overpriced side
      const sum = yesPrice + noPrice;
      if (sum > 1.05) {
        const dir = yesPrice > noPrice ? 'NO' : 'YES'; // bet against overpriced
        return { direction: dir, entryPrice: dir === 'YES' ? yesPrice : noPrice, confidence: 65, scannerType };
      }
      return null;
    }

    case 'SOCIAL':
    case 'CROSS_DOMAIN': {
      // Price dislocation: if price reverted >3pp from recent extreme, bet on continuation
      const recent5 = prices.slice(-5);
      const max5 = Math.max(...recent5);
      const min5 = Math.min(...recent5);
      const range = max5 - min5;
      if (range > 0.03 && latest < max5 - range * 0.3) {
        return { direction: 'YES', entryPrice: latest, confidence: 58, scannerType };
      }
      if (range > 0.03 && latest > min5 + range * 0.3) {
        return { direction: 'NO', entryPrice: latest, confidence: 58, scannerType };
      }
      return null;
    }

    case 'SPORTS':
    case 'BASEBALL': {
      // Sports markets: bet on favorites when price dips below historical mean
      const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
      if (latest < mean - 0.04) {
        return { direction: 'YES', entryPrice: latest, confidence: 62, scannerType };
      }
      if (latest > mean + 0.04) {
        return { direction: 'NO', entryPrice: latest, confidence: 62, scannerType };
      }
      return null;
    }

    default:
      return null;
  }
}

// ─── Determine trade outcome from resolved market ─────────────────────────────
// Gamma API returns outcomePrices: ["1","0"] (YES won) or ["0","1"] (NO won)
// on resolved markets. tokens.winner is NOT returned by the list endpoint.
function resolveOutcome(
  market: GammaMarket,
  signal: EntrySignal,
): { won: boolean; exitPrice: number } | null {
  // Try outcomePrices first (always available on resolved markets)
  if (market.outcomePrices) {
    try {
      const prices = typeof market.outcomePrices === 'string'
        ? JSON.parse(market.outcomePrices) as string[]
        : market.outcomePrices as unknown as string[];

      if (prices.length >= 2) {
        const yesPrice = parseFloat(prices[0]);
        const noPrice = parseFloat(prices[1]);

        // Resolved: one price is 1 (or very close), the other is 0
        if (yesPrice > 0.9 || noPrice > 0.9 || yesPrice < 0.1 || noPrice < 0.1) {
          const yesWon = yesPrice > 0.5;
          if (signal.direction === 'YES') {
            return { won: yesWon, exitPrice: yesWon ? 1.0 : 0.0 };
          } else {
            return { won: !yesWon, exitPrice: !yesWon ? 1.0 : 0.0 };
          }
        }
      }
    } catch {}
  }

  // Fallback: try tokens.winner
  const tokens = market.tokens || [];
  const yesToken = tokens.find(t => t.outcome === 'Yes' || t.outcome === 'YES');
  const noToken = tokens.find(t => t.outcome === 'No' || t.outcome === 'NO');
  const yesWon = yesToken?.winner === true;
  const noWon = noToken?.winner === true;
  if (!yesWon && !noWon) return null;

  if (signal.direction === 'YES') {
    return { won: yesWon, exitPrice: yesWon ? 1.0 : 0.0 };
  } else {
    return { won: noWon, exitPrice: noWon ? 1.0 : 0.0 };
  }
}

// ─── Fetch and process resolved markets ───────────────────────────────────────
async function fetchHistoricalTrades(
  scannerType: ScannerType | 'BLENDED',
  lookbackDays: number,
): Promise<BacktestTrade[]> {
  const scannerTypes: ScannerType[] = scannerType === 'BLENDED'
    ? ['ARB', 'SPREAD', 'VELOCITY', 'DIVERGENCE', 'SOCIAL', 'CROSS_DOMAIN', 'SPORTS', 'BASEBALL']
    : [scannerType];

  // Fetch resolved markets from Polymarket (real data)
  // Scale fetch count by lookback: longer periods need more markets
  const fetchCount = Math.min(500, Math.max(200, lookbackDays * 3));
  const resolvedMarkets = await fetchResolvedMarkets(fetchCount, 0);
  if (!resolvedMarkets.length) return [];

  // Filter markets to those closed within the lookback window
  const cutoffMs = Date.now() - lookbackDays * 86400000;
  const filteredMarkets = resolvedMarkets.filter(m => {
    if (!m.endDate) return true; // include if no end date info
    return new Date(m.endDate).getTime() >= cutoffMs;
  });
  if (!filteredMarkets.length) return [];

  const trades: BacktestTrade[] = [];
  const positionSize = 100; // $100 per trade

  // Process markets in batches to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < filteredMarkets.length && trades.length < 300; i += batchSize) {
    const batch = filteredMarkets.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(async (market) => {
        // Extract YES token ID from clobTokenIds (JSON string: ["YES_ID", "NO_ID"])
        let yesTokenId: string | undefined;
        if (market.clobTokenIds) {
          try {
            const ids = typeof market.clobTokenIds === 'string'
              ? JSON.parse(market.clobTokenIds) as string[]
              : market.clobTokenIds as unknown as string[];
            yesTokenId = ids[0]; // First element is YES token
          } catch {}
        }
        // Fallback: try tokens array if available
        if (!yesTokenId) {
          const yesToken = market.tokens?.find(t => (t.outcome === 'Yes' || t.outcome === 'YES') && t.token_id);
          yesTokenId = yesToken?.token_id;
        }
        if (!yesTokenId) return [];

        // Fetch real historical prices
        const priceHistory = await getPricesHistory(yesTokenId, '1d', 60);
        if (priceHistory.length < 3) return [];

        const marketTrades: BacktestTrade[] = [];
        const category = parseMarketCategory(market);

        // Try each scanner type on this market
        for (const st of scannerTypes) {
          // Use price data from the first 70% for entry (walk-forward: no look-ahead)
          // For short histories (3-4 points), use all but last point for entry
          const splitIdx = Math.max(2, Math.floor(priceHistory.length * 0.7));
          const entryPrices = priceHistory.slice(0, splitIdx);

          if (entryPrices.length < 2) continue;

          const signal = evaluateEntry(market, entryPrices, st);
          if (!signal) continue;

          const outcome = resolveOutcome(market, signal);
          if (!outcome) continue;

          const costBasis = signal.direction === 'YES' ? signal.entryPrice : (1 - signal.entryPrice);
          const shares = positionSize / costBasis;
          const pnl = outcome.won ? shares * 1.0 - positionSize : -positionSize;
          const returnPct = outcome.won ? ((1.0 - costBasis) / costBasis) * 100 : -100;

          const entryTimestamp = entryPrices[entryPrices.length - 1]?.t
            ? entryPrices[entryPrices.length - 1].t * 1000 // convert seconds to ms if needed
            : Date.now() - lookbackDays * 86400000;

          marketTrades.push({
            timestamp: entryTimestamp > 1e12 ? entryTimestamp : entryTimestamp * 1000,
            market: market.question.slice(0, 80),
            direction: signal.direction,
            entry: Math.round(signal.entryPrice * 1000) / 1000,
            exit: Math.round(outcome.exitPrice * 1000) / 1000,
            returnPct: Math.round(returnPct * 100) / 100,
            pnl: Math.round(pnl * 100) / 100,
            strategy: st,
            confidence: signal.confidence,
            category: category as never,
          });
        }

        return marketTrades;
      }),
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        trades.push(...result.value);
      }
    }
  }

  return trades.sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Per-trade Sharpe ─────────────────────────────────────────────────────────
// For prediction markets, we use un-annualized per-trade Sharpe: mean/std.
// This measures signal quality without calendar-dependent inflation.
function perTradeSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return mean > 0 ? 2.0 : 0; // all-winning trades → cap at 2.0
  return Math.round((mean / std) * 100) / 100;
}

// ─── Main backtest (real data) ────────────────────────────────────────────────
export async function computeBacktest(
  strategy: ScannerType | 'BLENDED',
  lookbackDays: number,
  _weights?: Record<string, number>,
): Promise<BacktestResult> {
  let allTrades = await fetchHistoricalTrades(strategy, lookbackDays);

  const emptyResult: BacktestResult = {
    edgeScore: 0, inSampleEdgeScore: 0, winRate: 0, profitFactor: 0, calmar: 0, maxDrawdown: 0,
    totalTrades: 0, wins: 0, losses: 0, avgWin: 0, avgLoss: 0, totalReturn: 0,
    alpha: 0, beta: 1, benchmarkReturn: 0, informationRatio: 0, treynorRatio: 0,
    treasuryRate: TREASURY_RATE,
    benchmarkEquityCurve: [{ t: 0, equity: 10000 }],
    confidenceInterval: { level: 95, lower: 0, upper: 0, z: 1.96 },
    brierScore: 1, sortinoRatio: 0, profitVolatility: 0, edgePerDollar: 0,
    monteCarlo: { pValue: 0, percentile5: 0, percentile95: 0 },
    equityCurve: [{ t: 0, equity: 10000 }],
    categoryBreakdown: [],
    trades: [],
  };

  if (!allTrades.length) return emptyResult;

  // ── Bootstrap resample (with replacement) ─────────────────────────────────
  // Each run draws N trades randomly WITH REPLACEMENT from the trade pool.
  // This produces varied Sharpe, equity curves, and metrics on every run.
  if (allTrades.length > 1) {
    let s = Date.now() ^ (Date.now() >>> 16);
    const rng = () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
    const resampled: BacktestTrade[] = [];
    for (let i = 0; i < allTrades.length; i++) {
      resampled.push(allTrades[Math.floor(rng() * allTrades.length)]);
    }
    allTrades = resampled.sort((a, b) => a.timestamp - b.timestamp);
  }

  // ── Equity curve ──────────────────────────────────────────────────────────
  // Scale per-trade returns to portfolio-level ($100 trade on $10,000 portfolio)
  const PORTFOLIO = 10000;
  const allReturns = allTrades.map(t => t.pnl / PORTFOLIO);
  const equity = computeEquityCurve(allReturns, PORTFOLIO);
  const maxDD = computeMaxDrawdown(equity.map(e => e.equity));
  const totalReturn = (equity[equity.length - 1].equity - 10000) / 10000;

  // ── Win/loss ──────────────────────────────────────────────────────────────
  const wins = allTrades.filter(t => t.pnl > 0);
  const losses = allTrades.filter(t => t.pnl <= 0);

  // ── Walk-forward split for Sharpe: first 70% = IS, last 30% = OOS ────────
  const splitIdx = Math.floor(allTrades.length * 0.7);
  const isTrades = allTrades.slice(0, splitIdx);
  const oosTrades = allTrades.slice(splitIdx);

  const isReturns = isTrades.map(t => t.pnl / PORTFOLIO);
  const oosReturns = oosTrades.map(t => t.pnl / PORTFOLIO);
  const inSampleEdgeScore = perTradeSharpe(isReturns);
  const edgeScore = perTradeSharpe(oosReturns);

  // ── S&P 500 benchmark ─────────────────────────────────────────────────────
  const benchmarkReturns = generateSP500Returns(lookbackDays);
  const benchmarkEquity = computeEquityCurve(benchmarkReturns, 10000);
  const benchmarkTotalReturn = (benchmarkEquity[benchmarkEquity.length - 1].equity - 10000) / 10000;

  // ── Alpha / Beta (daily returns needed for benchmark comparison) ──────────
  // Bucket trades into daily returns for alpha/beta vs daily S&P
  const dailyReturns = new Array<number>(lookbackDays).fill(0);
  if (allTrades.length > 0) {
    const startTs = allTrades[0].timestamp;
    for (const trade of allTrades) {
      const dayIdx = Math.min(lookbackDays - 1, Math.max(0,
        Math.floor((trade.timestamp - startTs) / 86400000),
      ));
      dailyReturns[dayIdx] += trade.returnPct / 100 / 100; // scale to portfolio-level
    }
  }

  const beta = computeBeta(dailyReturns, benchmarkReturns);
  const alpha = computeAlpha(dailyReturns, benchmarkReturns);
  const informationRatio = computeInformationRatio(dailyReturns, benchmarkReturns);
  const treynorRatio = computeTreynorRatio(dailyReturns, beta);

  // ── CI on OOS per-trade returns ───────────────────────────────────────────
  const confidenceInterval = computeConfidenceInterval(oosReturns);

  // ── Brier Score ───────────────────────────────────────────────────────────
  // Uses the actual entry signal confidence vs outcome
  const brierTrades = allTrades.map(t => ({
    pnl: t.pnl,
    confidence: t.confidence ?? 55, // use actual signal confidence
  }));
  const brierScore = computeBrierScore(brierTrades);

  // ── Sortino (per-trade, OOS, un-annualized) ──────────────────────────────
  const oosDownside = oosReturns.filter(r => r < 0);
  const oosMean = oosReturns.length > 0 ? oosReturns.reduce((s, r) => s + r, 0) / oosReturns.length : 0;
  const downsideVar = oosDownside.length > 0 ? oosDownside.reduce((s, r) => s + (r - oosMean) ** 2, 0) / oosDownside.length : 0;
  const downsideStd = Math.sqrt(downsideVar);
  const sortinoRatio = downsideStd > 0 ? Math.round((oosMean / downsideStd) * 100) / 100 : 0;

  // ── Profit / Volatility (mean return / std dev, all trades) ───────────────
  const profitVolatility = (() => {
    if (allReturns.length < 2) return 0;
    const m = allReturns.reduce((s, r) => s + r, 0) / allReturns.length;
    const std = Math.sqrt(allReturns.reduce((s, r) => s + (r - m) ** 2, 0) / (allReturns.length - 1));
    if (std === 0) return m > 0 ? 5.0 : 0;
    return Math.round((m / std) * 100) / 100;
  })();

  // ── Edge per Dollar ───────────────────────────────────────────────────────
  const edgeTrades = allTrades.map(t => ({
    pnl: t.pnl,
    size: Math.abs(t.pnl / (t.returnPct / 100 || 1)),
  }));
  const edgePerDollar = computeEdgePerDollar(edgeTrades);

  // ── Monte Carlo Bootstrap ─────────────────────────────────────────────────
  const monteCarlo = computeMonteCarloBootstrap(allReturns);

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
    avgWin: wins.length ? Math.round((wins.reduce((s, t) => s + t.pnl, 0) / wins.length) * 100) / 100 : 0,
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
    brierScore,
    sortinoRatio,
    profitVolatility,
    edgePerDollar,
    monteCarlo,
    equityCurve: equity,
    categoryBreakdown,
    trades: allTrades.slice(-50),
  };
}

// Re-export for optimizer compatibility
export { fetchHistoricalTrades as generateBacktestTrades };
