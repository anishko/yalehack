import type { ScannerType, StrategyPerformance, OptimizedBlend } from '@/types';
import { computeMaxDrawdown, computeProfitFactor, computeCalmar, computeEquityCurve } from './sharpe';
import { fetchResolvedMarkets, parseMarketCategory, type GammaMarket } from '@/lib/polymarket/gamma';
import { getPricesHistory } from '@/lib/polymarket/clob';
import type { BacktestTrade } from '@/types';

// Category relevance filter — same as backtest.ts
const SPORT_KW = /\bnba\b|nfl\b|mlb\b|nhl\b|soccer|premier league|ufc|mma|stanley cup|super bowl|lakers|celtics|warriors|chiefs/i;
const MLB_KW = /\bmlb\b|baseball|world series|pennant|yankees|dodgers|red sox|cubs|mets|astros|braves|innings|pitcher|home run/i;
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
  if (st === 'BASEBALL') return MLB_KW.test(q) || cat === 'baseball' || cat === 'sports';
  return true;
}

// Per-trade Sharpe: mean(trade returns) / std(trade returns) * sqrt(trades_per_year)
// Un-annualized per-trade Sharpe: mean/std (signal quality)
function perTradeSharpe(tradeReturns: number[]): number {
  if (tradeReturns.length < 2) return 0;
  const mean = tradeReturns.reduce((s, r) => s + r, 0) / tradeReturns.length;
  const variance = tradeReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (tradeReturns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return mean > 0 ? 2.0 : 0;
  return Math.round((mean / std) * 100) / 100;
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
    case 'BASEBALL': {
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
  const allTypes: ScannerType[] = ['ARB', 'SPREAD', 'VELOCITY', 'DIVERGENCE', 'SOCIAL', 'CROSS_DOMAIN', 'SPORTS', 'BASEBALL'];
  const result: Record<string, BacktestTrade[]> = {};
  for (const t of allTypes) result[t] = [];

  const fetchCount = Math.min(500, Math.max(150, lookbackDays * 3));
  const resolvedMarkets = await fetchResolvedMarkets(fetchCount, 0);
  if (!resolvedMarkets.length) return result as Record<ScannerType, BacktestTrade[]>;

  // Filter markets to those closed within the lookback window
  const cutoffMs = Date.now() - lookbackDays * 86400000;
  const filteredMarkets = resolvedMarkets.filter(m => {
    if (!m.endDate) return true;
    return new Date(m.endDate).getTime() >= cutoffMs;
  });
  if (!filteredMarkets.length) return result as Record<ScannerType, BacktestTrade[]>;

  const batchSize = 10;
  for (let i = 0; i < filteredMarkets.length; i += batchSize) {
    const batch = filteredMarkets.slice(i, i + batchSize);
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
        if (!yesTokenId) return;

        const priceHistory = await getPricesHistory(yesTokenId, '1d', 60);
        if (priceHistory.length < 3) return;

        const prices = priceHistory.map(h => h.p);
        const splitIdx = Math.max(2, Math.floor(prices.length * 0.7));
        const entryPrices = prices.slice(0, splitIdx);
        if (entryPrices.length < 2) return;

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
            confidence: signal.confidence,
            category: category as never,
          });
        }
      }),
    );
  }

  return result as Record<ScannerType, BacktestTrade[]>;
}

function buildStrategyPerformance(type: ScannerType, trades: BacktestTrade[]): StrategyPerformance {
  const PORTFOLIO = 10000;
  // Scale per-trade returns to portfolio-level returns
  const tradeReturns = trades.map(t => (t.pnl / PORTFOLIO));
  const wins = trades.filter(t => t.pnl > 0);
  const equity = computeEquityCurve(tradeReturns, PORTFOLIO);
  const maxDD = computeMaxDrawdown(equity.map(e => e.equity));
  const totalReturn = (equity[equity.length - 1]?.equity - 10000) / 10000;
  // Calculate trades per month from actual timestamp span (avoid inflated annualization)
  const timestamps = trades.map(t => t.timestamp);
  const spanMs = timestamps.length >= 2 ? Math.max(...timestamps) - Math.min(...timestamps) : 30 * 86400000;
  const spanMonths = Math.max(1, spanMs / (30 * 86400000));
  const tradesPerMonth = trades.length / spanMonths;

  const names: Record<ScannerType, string> = {
    ARB: 'Arbitrage', SPREAD: 'Spread', VELOCITY: 'Momentum',
    DIVERGENCE: 'Divergence', SOCIAL: 'Social', CROSS_DOMAIN: 'Cross-Domain',
    SPORTS: 'Sports', BASEBALL: 'Baseball',
  };

  return {
    name: names[type],
    type,
    returns: tradeReturns,
    edgeScore: perTradeSharpe(tradeReturns),
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
  const types: ScannerType[] = ['ARB', 'SPREAD', 'VELOCITY', 'DIVERGENCE', 'SOCIAL', 'CROSS_DOMAIN', 'SPORTS', 'BASEBALL'];

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
  const blendedSharpe = perTradeSharpe(blendedTrades);

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
