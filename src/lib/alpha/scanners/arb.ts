import type { PolymarketMarket, RankedSignal } from '@/types';
import { getPrice } from '@/lib/polymarket/clob';
import { nanoid } from '../utils';

// Scanner 1: Sum-to-one arbitrage
// If YES buy + NO buy < $0.99, there's a risk-free profit

export async function scanArbitrage(markets: PolymarketMarket[]): Promise<RankedSignal[]> {
  const signals: RankedSignal[] = [];

  for (const market of markets) {
    const tokens = market.tokens || [];
    const yesToken = tokens.find(t => t.outcome === 'Yes' || t.outcome === 'YES');
    const noToken = tokens.find(t => t.outcome === 'No' || t.outcome === 'NO');

    if (!yesToken?.token_id || !noToken?.token_id) continue;

    const [yesBuy, noBuy] = await Promise.allSettled([
      getPrice(yesToken.token_id, 'BUY'),
      getPrice(noToken.token_id, 'BUY'),
    ]);

    const yesPrice = yesBuy.status === 'fulfilled' ? yesBuy.value : null;
    const noPrice = noBuy.status === 'fulfilled' ? noBuy.value : null;

    if (yesPrice === null || noPrice === null) continue;

    const total = yesPrice + noPrice;
    const arbEdge = 1.0 - total;

    if (arbEdge > 0.005) { // at least 0.5 cent edge
      const edgePct = arbEdge * 100;
      const confidence = Math.min(99, 70 + edgePct * 10);

      signals.push({
        id: nanoid(),
        scannerType: 'ARB',
        marketId: market.conditionId,
        marketQuestion: market.question,
        direction: 'YES',
        confidence: Math.round(confidence),
        expectedEdge: arbEdge,
        riskScore: Math.max(5, 30 - edgePct * 5),
        edgeScore: Math.min(5, 2 + edgePct * 2),
        summary: `Arb: YES+NO = $${total.toFixed(3)} — buy both, guarantee $${arbEdge.toFixed(3)} profit`,
        details: `YES buy: $${yesPrice.toFixed(3)}, NO buy: $${noPrice.toFixed(3)}, Sum: $${total.toFixed(3)}, Edge: $${arbEdge.toFixed(4)} per dollar`,
        timestamp: Date.now(),
        marketPrice: yesPrice,
        category: market.category,
      });
    }
  }

  return signals.sort((a, b) => b.expectedEdge - a.expectedEdge);
}
