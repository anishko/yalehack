import type { PolymarketMarket, RankedSignal } from '@/types';
import { getOrderbook } from '@/lib/polymarket/clob';
import { nanoid } from '../utils';

// Scanner 2: Wide spread (market-making opportunity)
// Wide bid-ask = capture the spread by sitting in the middle

export async function scanSpread(markets: PolymarketMarket[]): Promise<RankedSignal[]> {
  const signals: RankedSignal[] = [];

  for (const market of markets) {
    if (!market.active || market.closed) continue;
    const yesToken = market.tokens.find(t => t.outcome === 'Yes' || t.outcome === 'YES');
    if (!yesToken?.token_id) continue;

    const book = await getOrderbook(yesToken.token_id);
    if (!book) continue;

    const bestBid = book.bids[0]?.price;
    const bestAsk = book.asks[0]?.price;
    if (!bestBid || !bestAsk) continue;

    const spread = bestAsk - bestBid;
    const mid = (bestBid + bestAsk) / 2;
    const spreadPct = spread / mid;

    // Interesting if spread > 3%
    if (spreadPct > 0.03 && mid > 0.05 && mid < 0.95) {
      const liquidity = market.liquidity || 0;
      const liquidityScore = Math.min(30, Math.log10(Math.max(1, liquidity)) * 5);

      signals.push({
        id: nanoid(),
        scannerType: 'SPREAD',
        marketId: market.conditionId,
        marketQuestion: market.question,
        direction: mid > 0.5 ? 'YES' : 'NO',
        confidence: Math.round(50 + spreadPct * 200),
        expectedEdge: spread / 2,
        riskScore: Math.round(60 - liquidityScore),
        edgeScore: Math.min(3.5, spreadPct * 30),
        summary: `Wide spread: ${(spreadPct * 100).toFixed(1)}% — mid at $${mid.toFixed(3)}`,
        details: `Bid: $${bestBid.toFixed(3)}, Ask: $${bestAsk.toFixed(3)}, Spread: $${spread.toFixed(4)} (${(spreadPct*100).toFixed(2)}%), Liquidity: $${liquidity?.toLocaleString()}`,
        timestamp: Date.now(),
        marketPrice: mid,
        category: market.category,
      });
    }
  }

  return signals.sort((a, b) => b.expectedEdge - a.expectedEdge).slice(0, 15);
}
