import { GammaMarket, parseMarketCategory } from './gamma';
import { getMidpoint, getSpread, getLastTradePrice } from './clob';
import type { PolymarketMarket } from '@/types';

export async function enrichMarket(gamma: GammaMarket): Promise<PolymarketMarket> {
  const tokens = (gamma.tokens || []).map(t => ({
    token_id: t.token_id,
    outcome: t.outcome,
    winner: t.winner,
  }));

  // Try to get YES token price
  const yesToken = tokens.find(t => t.outcome === 'Yes' || t.outcome === 'YES');
  let midPrice: number | undefined;
  let spread: number | undefined;
  let lastPrice: number | undefined;

  if (yesToken?.token_id) {
    const [mid, sp, last] = await Promise.allSettled([
      getMidpoint(yesToken.token_id),
      getSpread(yesToken.token_id),
      getLastTradePrice(yesToken.token_id),
    ]);
    midPrice = mid.status === 'fulfilled' && mid.value !== null ? mid.value : undefined;
    spread = sp.status === 'fulfilled' && sp.value !== null ? sp.value : undefined;
    lastPrice = last.status === 'fulfilled' && last.value !== null ? last.value : undefined;
  }

  // Parse outcomePrices from gamma if CLOB failed
  if (midPrice === undefined && gamma.outcomePrices) {
    try {
      const prices = JSON.parse(gamma.outcomePrices) as string[];
      if (prices[0]) midPrice = parseFloat(prices[0]);
    } catch { /* ignore */ }
  }

  const category = parseMarketCategory(gamma);

  const riskScore = computeMarketRisk({
    endDate: gamma.endDate,
    liquidity: typeof gamma.liquidity === 'string' ? parseFloat(gamma.liquidity) : gamma.liquidity,
    midPrice,
    spread,
    active: gamma.active,
  });

  return {
    id: gamma.id,
    conditionId: gamma.conditionId,
    question: gamma.question,
    description: gamma.description,
    category,
    slug: gamma.slug,
    startDate: gamma.startDate,
    endDate: gamma.endDate,
    active: gamma.active,
    closed: gamma.closed,
    archived: gamma.archived,
    volume: typeof gamma.volume === 'string' ? parseFloat(gamma.volume) : gamma.volume,
    liquidity: typeof gamma.liquidity === 'string' ? parseFloat(gamma.liquidity) : gamma.liquidity,
    tokens,
    tags: (gamma.tags || []).map(t => t.label || t.slug || '').filter(Boolean),
    midPrice,
    spread,
    lastPrice,
    riskScore,
  };
}

function computeMarketRisk(params: {
  endDate?: string;
  liquidity?: number;
  midPrice?: number;
  spread?: number;
  active: boolean;
}): number {
  let risk = 50;

  // Time to resolution
  if (params.endDate) {
    const daysLeft = (new Date(params.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysLeft < 1) risk += 20;
    else if (daysLeft < 7) risk += 10;
    else if (daysLeft > 365) risk += 5;
    else if (daysLeft > 180) risk += 0;
    else risk -= 5;
  }

  // Liquidity
  if (!params.liquidity || params.liquidity < 1000) risk += 15;
  else if (params.liquidity > 100000) risk -= 10;
  else if (params.liquidity > 10000) risk -= 5;

  // Price extremes (near 0 or 1 = very directional = higher risk)
  if (params.midPrice !== undefined) {
    const dist = Math.abs(params.midPrice - 0.5);
    if (dist > 0.45) risk += 15;
    else if (dist > 0.35) risk += 5;
    else risk -= 5;
  }

  // Wide spread = illiquid = higher risk
  if (params.spread !== undefined) {
    if (params.spread > 0.10) risk += 10;
    else if (params.spread > 0.05) risk += 5;
    else risk -= 5;
  }

  return Math.max(0, Math.min(100, risk));
}

export async function enrichMarkets(gammaMarkets: GammaMarket[]): Promise<PolymarketMarket[]> {
  // Enrich in batches to avoid rate limits
  const batchSize = 10;
  const results: PolymarketMarket[] = [];

  for (let i = 0; i < gammaMarkets.length; i += batchSize) {
    const batch = gammaMarkets.slice(i, i + batchSize);
    const enriched = await Promise.allSettled(batch.map(m => enrichMarket(m)));
    for (const r of enriched) {
      if (r.status === 'fulfilled') results.push(r.value);
    }
  }
  return results;
}
