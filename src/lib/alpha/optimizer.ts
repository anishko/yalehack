import type { ScannerType, StrategyPerformance, OptimizedBlend } from '@/types';
import { computeMaxDrawdown, computeProfitFactor, computeCalmar, computeEquityCurve } from './sharpe';
import { fetchResolvedMarkets, parseMarketCategory, type GammaMarket } from '@/lib/polymarket/gamma';
import { getPricesHistory } from '@/lib/polymarket/clob';
import type { BacktestTrade } from '@/types';

// Category relevance filter — same as backtest.ts
const SPORT_KW = /\bnba\b|nfl\b|mlb\b|nhl\b|soccer|premier league|ufc|mma|stanley cup|super bowl|lakers|celtics|warriors|chiefs/i;
const MM_KW = /march madness|ncaa|final four|sweet sixteen|sweet 16|elite eight|bracket|tournament/i;
const CRYPTO_KW = /bitcoin|btc|ethereum|eth|crypto|defi|solana/i;
const POLITICS_KW = /election|president|senator|vote|congress|trump|biden/i;
const FINANCE_KW = /stock|market|fed|rate|gdp|recession|inflation|ipo|s&p|nasdaq/i;
const GEO_KW = /war|conflict|military|invasion|sanctions|nato|missile/i;

function isRelevant(market: GammaMarket, st: ScannerType): boolean {
  const q = market.question.toLowerCase();
  const cat = (market.category || '').toLowerCase();
  if (st === 'ARB' || st === 'SPREAD' || st === 'DIVERGENCE' || st === 'VELOCITY') return true;
  if (st === 'SOCIAL') return POLITICS_KW.test(q) || CRYPTO_KW.test(q) || cat === 'politics' || cat === 'crypto';
  if (st === 'CROSS_DOMAIN') return FINANCE_KW.test(q) || CRYPTO_KW.test(q) || GEO_KW.test(q);
  if (st === 'SPORTS') return SPORT_KW.test(q) || cat === 'sports';
  if (st === 'MARCH_MADNESS') return MM_KW.test(q) || cat === 'ncaa';
  return true;
}

// Per-trade Sharpe: mean(trade returns) / std(trade returns) * sqrt(trades_per_year)
function perTradeSharpe(tradeReturns: number[], tradesPerMonth: number): number {
  if (tradeReturns.length < 2) return 0;
  const mean = tradeReturns.reduce((s, r) => s + r, 0) / tradeReturns.length;
  const variance = tradeReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (tradeReturns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  const tradesPerYear = tradesPerMonth * 12;
  return Math.round((mean / std) * Math.sqrt(tradesPerYear) * 100) / 100;
}

// ─── Simplified entry logic per scanner (same as backtest.ts) ─────────────────
function evaluateEntry(
  yesPrice: number,
  noPrice: number,
  priceHistory: number[],
  scannerType: ScannerType,
): { direction: 'YES' | 'NO'; entryPrice: number; confidence: number } | null {
  const latest = priceHistory[priceHistory.length - 1];

  switch (scannerType) {
    case 'ARB': {
      const sum = yesPrice + noPrice;
      if (sum < 0.98 && sum > 0.5) return { direction: 'YES', entryPrice: yesPrice, confidence: 85 };
      return null;
    }
    case 'SPREAD': {
      if (latest > 0.40 && latest < 0.60) {
        return { direction: latest < 0.50 ? 'YES' : 'NO', entryPrice: latest, confidence: 55 };
      }
      return null;
    }
    case 'VELOCITY': {
      const lookback = priceHistory.slice(-4);
      const move = lookback[lookback.length - 1] - lookback[0];
      if (Math.abs(move) > 0.05) {
        return { direction: move > 0 ? 'YES' : 'NO', entryPrice: latest, confidence: Math.min(75, 50 + Math.abs(move) * 200) };
      }
      return null;
    }
    case 'DIVERGENCE': {
      const sum = yesPrice + noPrice;
      if (sum > 1.05) return { direction: yesPrice > noPrice ? 'NO' : 'YES', entryPrice: latest, confidence: 65 };
      return null;
    }
    case 'SOCIAL':
    case 'CROSS_DOMAIN': {
      const recent5 = priceHistory.slice(-5);
      const max5 = Math.max(...recent5);
      const min5 = Math.min(...recent5);
      const range = max5 - min5;
      if (range > 0.03 && latest < max5 - range * 0.3) return { direction: 'YES', entryPrice: latest, confidence: 58 };
      if (range > 0.03 && latest > min5 + range * 0.3) return { direction: 'NO', entryPrice: latest, confidence: 58 };
      return null;
    }
    case 'SPORTS':
    case 'MARCH_MADNESS': {
      const mean = priceHistory.reduce((s, p) => s + p, 0) / priceHistory.length;
      if (latest < mean - 0.04) return { direction: 'YES', entryPrice: latest, confidence: 62 };
      if (latest > mean + 0.04) return { direction: 'NO', entryPrice: latest, confidence: 62 };
      return null;
    }
    default:
      return null;
  }
}

// ─── Fetch real trades for all strategies at once ─────────────────────────────
async function fetchAllStrategyTrades(lookbackDays: number): Promise<Record<ScannerType, BacktestTrade[]>> {
  const allTypes: ScannerType[] = ['ARB', 'SPREAD', 'VELOCITY', 'DIVERGENCE', 'SOCIAL', 'CROSS_DOMAIN', 'SPORTS', 'MARCH_MADNESS'];
  const result: Record<string, BacktestTrade[]> = {};
  for (const t of allTypes) result[t] = [];

  const resolvedMarkets = await fetchResolvedMarkets(150, 0);
  if (!resolvedMarkets.length) return result as Record<ScannerType, BacktestTrade[]>;

  const batchSize = 10;
  for (let i = 0; i < resolvedMarkets.length; i += batchSize) {
    const batch = resolvedMarkets.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (market) => {
        // Determine outcome from outcomePrices
        if (!market.outcomePrices) return;
        let outcomeYesWon: boolean;
        try {
          const prices = typeof market.outcomePrices === 'string'
            ? JSON.parse(market.outcomePrices) as string[]
            : market.outcomePrices as unknown as string[];
          const yp = parseFloat(prices[0]);
          const np = parseFloat(prices[1]);
          if (yp < 0.1 && np < 0.1) return; // not resolved yet
          outcomeYesWon = yp > 0.5;
        } catch { return; }

        // Fetch individual market to get token IDs for price history
        const { fetchMarketById } = await import('@/lib/polymarket/gamma');
        const fullMarket = await fetchMarketById(market.conditionId);
        const yesToken = fullMarket?.tokens?.find(t => t.outcome === 'Yes' || t.outcome === 'YES');
        if (!yesToken?.token_id) return;

        const priceHistory = await getPricesHistory(yesToken.token_id, '1d', 60);
        if (priceHistory.length < 5) return;

        const prices = priceHistory.map(h => h.p);
        const splitIdx = Math.floor(prices.length * 0.7);
        const entryPrices = prices.slice(0, splitIdx);
        if (entryPrices.length < 5) return;

        const yesPrice = entryPrices[entryPrices.length - 1];
        const noPrice = 1 - yesPrice;

        const category = parseMarketCategory(market);
        const positionSize = 100;

        for (const st of allTypes) {
          if (!isRelevant(market, st)) continue;
          const signal = evaluateEntry(yesPrice, noPrice, entryPrices, st);
          if (!signal) continue;

          const won = signal.direction === 'YES' ? outcomeYesWon : !outcomeYesWon;
          const exitPrice = won ? 1.0 : 0.0;
          const pnl = won
            ? positionSize * (exitPrice - signal.entryPrice)
            : positionSize * (0 - signal.entryPrice) * (signal.direction === 'YES' ? 1 : -1);
          const returnPct = won
            ? ((exitPrice - signal.entryPrice) / signal.entryPrice) * 100
            : ((0 - signal.entryPrice) / signal.entryPrice) * 100 * (signal.direction === 'YES' ? 1 : -1);

          const ts = priceHistory[splitIdx]?.t ?? Date.now() / 1000;

          result[st].push({
            timestamp: ts > 1e12 ? ts : ts * 1000,
            market: market.question.slice(0, 80),
            direction: signal.direction,
            entry: Math.round(signal.entryPrice * 1000) / 1000,
            exit: Math.round(exitPrice * 1000) / 1000,
            returnPct: Math.round(returnPct * 100) / 100,
            pnl: Math.round(pnl * 100) / 100,
            strategy: st,
            category: category as never,
          });
        }
      }),
    );
  }

  return result as Record<ScannerType, BacktestTrade[]>;
}

function buildStrategyPerformance(type: ScannerType, trades: BacktestTrade[]): StrategyPerformance {
  const tradeReturns = trades.map(t => t.returnPct / 100);
  const wins = trades.filter(t => t.pnl > 0);
  const equity = computeEquityCurve(tradeReturns, 10000);
  const maxDD = computeMaxDrawdown(equity.map(e => e.equity));
  const totalReturn = (equity[equity.length - 1]?.equity - 10000) / 10000;
  const tradesPerMonth = trades.length / 3; // ~90 days lookback

  const names: Record<ScannerType, string> = {
    ARB: 'Arbitrage', SPREAD: 'Spread', VELOCITY: 'Momentum',
    DIVERGENCE: 'Divergence', SOCIAL: 'Social', CROSS_DOMAIN: 'Cross-Domain',
    SPORTS: 'Sports', MARCH_MADNESS: 'March Madness',
  };

  return {
    name: names[type],
    type,
    returns: tradeReturns,
    edgeScore: perTradeSharpe(tradeReturns, Math.max(1, tradesPerMonth)),
    winRate: trades.length ? Math.round((wins.length / trades.length) * 100) / 100 : 0,
    avgReturn: tradeReturns.length ? tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length : 0,
    maxDrawdown: maxDD,
    profitFactor: computeProfitFactor(trades.map(t => ({ pnl: t.pnl }))),
    tradeFrequency: Math.max(1, tradesPerMonth),
    calmar: computeCalmar(totalReturn * 100, maxDD),
    tradeCount: trades.length,
  };
}

export async function optimizeStrategyBlend(lookbackDays = 90): Promise<OptimizedBlend> {
  const types: ScannerType[] = ['ARB', 'SPREAD', 'VELOCITY', 'DIVERGENCE', 'SOCIAL', 'CROSS_DOMAIN', 'SPORTS', 'MARCH_MADNESS'];

  // Fetch all trades once from real resolved markets
  const allStrategyTrades = await fetchAllStrategyTrades(lookbackDays);
  const strategies = types.map(t => buildStrategyPerformance(t, allStrategyTrades[t]));

  // Simple weight optimization: allocate proportionally to Sharpe, zero out negatives
  const sharpes = strategies.map(s => Math.max(0, s.edgeScore));
  const totalSharpe = sharpes.reduce((s, v) => s + v, 0);

  const bestWeights = totalSharpe > 0
    ? sharpes.map(s => Math.round((s / totalSharpe) * 100) / 100)
    : [0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125]; // equal weight fallback

  // Blend returns
  const blendedTrades: number[] = [];
  strategies.forEach((strat, i) => {
    const w = bestWeights[i];
    if (w <= 0) return;
    strat.returns.forEach(r => blendedTrades.push(r * w));
  });
  blendedTrades.sort(() => 0); // preserve order

  const equity = computeEquityCurve(blendedTrades, 10000);
  const maxDD = computeMaxDrawdown(equity.map(e => e.equity));
  const totalReturn = (equity[equity.length - 1]?.equity - 10000) / 10000;

  const wins = blendedTrades.filter(r => r > 0);
  const blendedSharpe = perTradeSharpe(blendedTrades, strategies.reduce((s, st, i) => s + st.tradeFrequency * bestWeights[i], 0));

  const weightMap = {} as Record<ScannerType, number>;
  types.forEach((t, i) => { weightMap[t] = bestWeights[i]; });

  const bestSingleSharpe = Math.max(...strategies.map(s => s.edgeScore));
  const bestSingleStrategy = strategies.find(s => s.edgeScore === bestSingleSharpe);

  return {
    weights: weightMap,
    blendedEdgeScore: blendedSharpe,
    blendedWinRate: blendedTrades.length ? Math.round((wins.length / blendedTrades.length) * 100) / 100 : 0,
    blendedMaxDrawdown: maxDD,
    blendedProfitFactor: computeProfitFactor(blendedTrades.map(r => ({ pnl: r }))),
    blendedCalmar: computeCalmar(totalReturn * 100, maxDD),
    equityCurve: equity,
    improvement: `Blend Sharpe ${blendedSharpe.toFixed(2)} vs best single (${bestSingleStrategy?.name ?? 'N/A'}) ${bestSingleSharpe.toFixed(2)}`,
    perStrategy: strategies,
  };
}
