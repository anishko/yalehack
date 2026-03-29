import type { PolymarketMarket, RankedSignal } from '@/types';
import { getOverview, ASSET_MARKET_KEYWORDS, type FinnhubQuote } from '@/lib/finnhub/client';
import { nanoid } from '../utils';

// Scanner 6: Cross-Domain Finance
// Financial assets move → linked Polymarket markets should follow but haven't

interface AssetSignal {
  symbol: string;
  label: string;
  quote: FinnhubQuote;
  direction: 'UP' | 'DOWN';
  magnitude: number; // abs % change
  keywords: string[];
}

function findLinkedMarkets(
  assetSignal: AssetSignal,
  markets: PolymarketMarket[]
): PolymarketMarket[] {
  const keywords = ASSET_MARKET_KEYWORDS[assetSignal.symbol] || [];
  const q = assetSignal.label.toLowerCase();

  return markets.filter(m => {
    const mq = m.question.toLowerCase();
    return keywords.some(kw => mq.includes(kw)) || mq.includes(q);
  });
}

function hasMarketPriceReacted(market: PolymarketMarket, assetDirection: 'UP' | 'DOWN'): boolean {
  const mid = market.midPrice ?? 0.5;
  // If asset went up, we'd expect YES price to be above 0.6 if market has reacted
  if (assetDirection === 'UP') return mid > 0.6;
  return mid < 0.4;
}

export async function scanCrossDomain(markets: PolymarketMarket[]): Promise<RankedSignal[]> {
  const signals: RankedSignal[] = [];

  const assetQuotes = await getOverview();

  // Build strong movers (>0.5% move)
  const movers: AssetSignal[] = assetQuotes
    .filter(a => a.quote && Math.abs(a.quote.dp) > 0.5)
    .map(a => ({
      symbol: a.symbol,
      label: a.label,
      quote: a.quote!,
      direction: a.quote!.dp > 0 ? 'UP' : 'DOWN',
      magnitude: Math.abs(a.quote!.dp),
      keywords: ASSET_MARKET_KEYWORDS[a.symbol] || [],
    }))
    .sort((a, b) => b.magnitude - a.magnitude);

  for (const mover of movers.slice(0, 5)) {
    const linked = findLinkedMarkets(mover, markets);

    for (const market of linked) {
      if (!market.active || market.closed) continue;

      const hasReacted = hasMarketPriceReacted(market, mover.direction);

      if (!hasReacted) {
        // Market hasn't priced in the financial move — opportunity
        const expectedDirection = mover.direction === 'UP' ? 'YES' : 'NO';
        const magnitude = mover.magnitude;

        signals.push({
          id: nanoid(),
          scannerType: 'CROSS_DOMAIN',
          marketId: market.conditionId,
          marketQuestion: market.question,
          direction: expectedDirection,
          confidence: Math.round(50 + magnitude * 5),
          expectedEdge: Math.min(0.15, magnitude * 0.01),
          riskScore: Math.round(55 - magnitude * 2),
          edgeScore: Math.min(2.5, magnitude * 0.2),
          summary: `${mover.label} ${mover.direction === 'UP' ? '▲' : '▼'} ${magnitude.toFixed(2)}% — linked market at $${market.midPrice?.toFixed(3) ?? '?'} hasn't priced it in`,
          details: `${mover.symbol}: $${mover.quote.c.toFixed(2)} (${mover.quote.dp > 0 ? '+' : ''}${mover.quote.dp.toFixed(2)}%) | Market: ${market.question.slice(0, 60)}`,
          timestamp: Date.now(),
          category: market.category,
          relatedAsset: mover.symbol,
        });
      }
    }
  }

  return signals.sort((a, b) => b.expectedEdge - a.expectedEdge).slice(0, 10);
}
