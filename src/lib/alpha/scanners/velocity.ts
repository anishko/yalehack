import type { PolymarketMarket, RankedSignal } from '@/types';
import { getPricesHistory } from '@/lib/polymarket/clob';
import { nanoid } from '../utils';

// Scanner 3: Price momentum / velocity
// Markets that moved > 5% recently + related lagging markets

export async function scanVelocity(markets: PolymarketMarket[]): Promise<RankedSignal[]> {
  const signals: RankedSignal[] = [];

  for (const market of markets) {
    if (!market.active || market.closed) continue;
    const yesToken = market.tokens.find(t => t.outcome === 'Yes' || t.outcome === 'YES');
    if (!yesToken?.token_id) continue;

    const history = await getPricesHistory(yesToken.token_id, '1d', 60);
    if (!history || history.length < 5) continue;

    const recent = history.slice(-5);
    const oldest = recent[0].p;
    const newest = recent[recent.length - 1].p;

    if (!oldest || !newest) continue;

    const pctChange = (newest - oldest) / oldest;
    const absChange = Math.abs(pctChange);

    if (absChange > 0.05) {
      const direction = pctChange > 0 ? 'YES' : 'NO';
      const momentum = absChange * 100;

      // Compute velocity (acceleration of price change)
      const velocities: number[] = [];
      for (let i = 1; i < recent.length; i++) {
        velocities.push(recent[i].p - recent[i - 1].p);
      }
      const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
      const isAccelerating = velocities[velocities.length - 1] > avgVelocity;

      signals.push({
        id: nanoid(),
        scannerType: 'VELOCITY',
        marketId: market.conditionId,
        marketQuestion: market.question,
        direction,
        confidence: Math.round(45 + momentum * 2 + (isAccelerating ? 10 : 0)),
        expectedEdge: absChange * 0.5,
        riskScore: Math.round(55 + Math.min(25, momentum)),
        edgeScore: Math.min(2.5, absChange * 15),
        summary: `${momentum.toFixed(1)}% move in last 5hrs — ${isAccelerating ? 'accelerating' : 'steady'} ${direction === 'YES' ? 'upward' : 'downward'} momentum`,
        details: `Price: $${oldest.toFixed(3)} → $${newest.toFixed(3)} (${pctChange > 0 ? '+' : ''}${(pctChange * 100).toFixed(2)}%), Avg velocity: ${(avgVelocity * 100).toFixed(3)}/hr`,
        timestamp: Date.now(),
        category: market.category,
      });
    }
  }

  return signals.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
}
