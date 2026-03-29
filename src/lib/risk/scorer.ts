import type { PolymarketMarket, Position, PortfolioStats } from '@/types';

export function scoreMarketRisk(market: PolymarketMarket): number {
  let risk = 50;

  if (market.endDate) {
    const daysLeft = (new Date(market.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysLeft < 1) risk += 20;
    else if (daysLeft < 7) risk += 10;
    else if (daysLeft > 365) risk += 5;
    else risk -= 5;
  }

  const liq = market.liquidity ?? 0;
  if (liq < 1000) risk += 15;
  else if (liq > 100000) risk -= 10;
  else if (liq > 10000) risk -= 5;

  if (market.midPrice !== undefined) {
    const dist = Math.abs(market.midPrice - 0.5);
    if (dist > 0.45) risk += 15;
    else if (dist > 0.35) risk += 5;
    else risk -= 5;
  }

  if (market.spread !== undefined) {
    if (market.spread > 0.10) risk += 10;
    else if (market.spread < 0.02) risk -= 5;
  }

  return Math.max(0, Math.min(100, Math.round(risk)));
}

export function scorePositionRisk(position: Position, currentPrice: number): number {
  let risk = position.riskScore;

  // Unrealized loss risk
  const pnlPct = position.pnlPct;
  if (pnlPct < -20) risk += 20;
  else if (pnlPct < -10) risk += 10;
  else if (pnlPct > 20) risk -= 5;

  // Concentration risk (handled in portfolio scorer)
  return Math.max(0, Math.min(100, Math.round(risk)));
}

export function scorePortfolioRisk(stats: PortfolioStats): number {
  if (!stats.positions.length) return 0;

  const avgPositionRisk = stats.positions.reduce((s, p) => s + p.riskScore, 0) / stats.positions.length;

  // Concentration adjustment: too many positions in one category increases risk
  const categoryCount = new Map<string, number>();
  for (const p of stats.positions) {
    const cat = p.category || 'Unknown';
    categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
  }
  const maxConcentration = Math.max(...categoryCount.values());
  const concentrationPenalty = maxConcentration > stats.positions.length * 0.5 ? 10 : 0;

  // P&L adjustment
  const pnlBonus = stats.totalPnlPct > 10 ? -5 : stats.totalPnlPct < -15 ? 15 : 0;

  return Math.max(0, Math.min(100, Math.round(avgPositionRisk + concentrationPenalty + pnlBonus)));
}

export function riskLabel(score: number): string {
  if (score <= 25) return 'LOW';
  if (score <= 50) return 'MODERATE';
  if (score <= 75) return 'ELEVATED';
  return 'HIGH';
}

export function riskColor(score: number): string {
  if (score <= 25) return '#22c55e';
  if (score <= 50) return '#3b82f6';
  if (score <= 75) return '#eab308';
  return '#ef4444';
}

export function riskEmoji(score: number): string {
  if (score <= 25) return '🟢';
  if (score <= 50) return '🔵';
  if (score <= 75) return '🟡';
  return '🔴';
}
