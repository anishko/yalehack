import type { PolymarketMarket, RankedSignal } from '@/types';
import { getMidpoint } from '@/lib/polymarket/clob';
import { nanoid } from '../utils';

// Scanner 4: Cross-market divergence / structural mispricing
// Multi-outcome event prices don't sum to 1.0 → mathematical edge

export async function scanDivergence(markets: PolymarketMarket[]): Promise<RankedSignal[]> {
  const signals: RankedSignal[] = [];

  // Group markets by question similarity (same event, different outcomes)
  // E.g. "Who will win the election?" with multiple candidate markets
  const grouped = groupRelatedMarkets(markets);

  for (const group of grouped) {
    if (group.length < 2) continue;

    // Get mid prices for all YES tokens in the group
    const pricedGroup: Array<{ market: PolymarketMarket; mid: number }> = [];

    for (const market of group) {
      const yesToken = market.tokens.find(t => t.outcome === 'Yes' || t.outcome === 'YES');
      if (!yesToken?.token_id) continue;
      const mid = await getMidpoint(yesToken.token_id);
      if (mid !== null) pricedGroup.push({ market, mid });
    }

    if (pricedGroup.length < 2) continue;

    const sumOfMids = pricedGroup.reduce((s, m) => s + m.mid, 0);
    const divergence = Math.abs(1.0 - sumOfMids);

    // Interesting if prices don't sum to ~1.0
    if (divergence > 0.04) {
      // Find the most underpriced outcome
      const expectedEach = 1.0 / pricedGroup.length;
      const underpriced = pricedGroup.filter(m => m.mid < expectedEach * 0.8);

      for (const candidate of underpriced) {
        signals.push({
          id: nanoid(),
          scannerType: 'DIVERGENCE',
          marketId: candidate.market.conditionId,
          marketQuestion: candidate.market.question,
          direction: 'YES',
          confidence: Math.round(60 + divergence * 200),
          expectedEdge: divergence / pricedGroup.length,
          riskScore: Math.round(40 - divergence * 50),
          edgeScore: Math.min(3.5, divergence * 20),
          summary: `Divergence: ${pricedGroup.length} related markets sum to ${sumOfMids.toFixed(3)} (not 1.0) — ${(divergence * 100).toFixed(1)}% gap`,
          details: `${pricedGroup.map(m => `${m.market.question.slice(0, 30)}: $${m.mid.toFixed(3)}`).join(' | ')} → Sum: ${sumOfMids.toFixed(3)}`,
          timestamp: Date.now(),
          category: candidate.market.category,
        });
      }
    }
  }

  return signals.sort((a, b) => b.expectedEdge - a.expectedEdge).slice(0, 8);
}

function groupRelatedMarkets(markets: PolymarketMarket[]): PolymarketMarket[][] {
  const groups: Map<string, PolymarketMarket[]> = new Map();

  for (const market of markets) {
    const q = market.question.toLowerCase();
    // Extract key topic words
    const key = extractTopicKey(q);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(market);
  }

  return Array.from(groups.values()).filter(g => g.length >= 2);
}

function extractTopicKey(question: string): string {
  // Look for election-like questions
  if (question.includes('win') || question.includes('president') || question.includes('election')) {
    // Extract year or candidate context
    const yearMatch = question.match(/\b(20\d{2})\b/);
    if (yearMatch) return `election-${yearMatch[1]}`;
  }
  if (question.includes('price') && (question.includes('bitcoin') || question.includes('btc'))) {
    return 'btc-price';
  }
  if (question.includes('price') && question.includes('ethereum')) {
    return 'eth-price';
  }
  // Use first 40 chars as loose grouping key
  return question.slice(0, 40).replace(/[^a-z0-9]/g, '-');
}
