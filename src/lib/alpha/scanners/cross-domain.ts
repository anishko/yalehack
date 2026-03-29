import type { PolymarketMarket, RankedSignal } from '@/types';
import { getOverview, ASSET_MARKET_KEYWORDS, type FinnhubQuote } from '@/lib/finnhub/client';
import { getEmbedding } from '@/lib/embeddings';
import { vectorSearchMarkets } from '@/lib/mongodb/markets';
import { nanoid } from '../utils';

// Scanner 6: Cross-Domain Finance
// Financial assets move → linked Polymarket markets should follow but haven't
// Uses MongoDB Vector Search to dynamically discover stock-market linkages
// instead of relying solely on hardcoded keyword mappings.

interface AssetSignal {
  symbol: string;
  label: string;
  quote: FinnhubQuote;
  direction: 'UP' | 'DOWN';
  magnitude: number; // abs % change
  keywords: string[];
}

async function findLinkedMarkets(
  assetSignal: AssetSignal,
  markets: PolymarketMarket[]
): Promise<PolymarketMarket[]> {
  // 1) Keyword match (fast, local) — existing logic
  const keywords = ASSET_MARKET_KEYWORDS[assetSignal.symbol] || [];
  const q = assetSignal.label.toLowerCase();
  const keywordMatches = markets.filter(m => {
    const mq = m.question.toLowerCase();
    return keywords.some(kw => mq.includes(kw)) || mq.includes(q);
  });

  // 2) Vector search (semantic, via MongoDB Atlas) — discovers non-obvious linkages
  //    e.g. "Lockheed Martin quarterly earnings" → "Will the US strike Iran?"
  let vectorMatches: PolymarketMarket[] = [];
  try {
    const searchText = `${assetSignal.label} ${assetSignal.symbol} ${assetSignal.direction === 'UP' ? 'rising' : 'falling'} ${assetSignal.magnitude.toFixed(1)}% ${keywords.join(' ')}`;
    const embedding = await getEmbedding(searchText);
    const stored = await vectorSearchMarkets(embedding, 5);
    // Convert StoredMarket → PolymarketMarket shape (just need conditionId + question)
    vectorMatches = stored
      .filter(sm => !keywordMatches.some(km => km.conditionId === sm.conditionId))
      .map(sm => {
        // Find full market in the live list, or create minimal object
        const live = markets.find(m => m.conditionId === sm.conditionId);
        return live ?? {
          id: sm.conditionId,
          conditionId: sm.conditionId,
          question: sm.question,
          active: true,
          closed: false,
          archived: false,
          tokens: sm.tokens ?? [],
          midPrice: undefined,
        } as PolymarketMarket;
      });
  } catch {
    // Vector search unavailable — fall through to keyword-only
  }

  // Combine, dedup by conditionId
  const seen = new Set<string>();
  const combined: PolymarketMarket[] = [];
  for (const m of [...keywordMatches, ...vectorMatches]) {
    if (!seen.has(m.conditionId)) {
      seen.add(m.conditionId);
      combined.push(m);
    }
  }
  return combined;
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
    const linked = await findLinkedMarkets(mover, markets);

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
          marketPrice: market.midPrice ?? 0.5,
          category: market.category,
          relatedAsset: mover.symbol,
        });
      }
    }
  }

  return signals.sort((a, b) => b.expectedEdge - a.expectedEdge).slice(0, 10);
}
