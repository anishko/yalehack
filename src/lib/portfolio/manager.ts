import { getDb } from '@/lib/mongodb/client';
import type { Position, TradeRecord, PortfolioStats } from '@/types';
import { computeSharpe, computeEquityCurve } from '@/lib/alpha/sharpe';
import { nanoid } from '@/lib/alpha/utils';
import { getMidpoint } from '@/lib/polymarket/clob';

const INITIAL_BALANCE = 10000;

interface PortfolioDoc {
  _id?: string;
  userId: string;
  cash: number;
  positions: Position[];
  trades: TradeRecord[];
  deposits: Array<{ amount: number; timestamp: number }>;
  createdAt: number;
  updatedAt: number;
}

async function getPortfolio(): Promise<PortfolioDoc> {
  const db = await getDb();
  let portfolio = await db.collection<PortfolioDoc>('portfolio').findOne({ userId: 'default' }) as PortfolioDoc | null;

  if (!portfolio) {
    portfolio = {
      userId: 'default',
      cash: INITIAL_BALANCE,
      positions: [],
      trades: [],
      deposits: [{ amount: INITIAL_BALANCE, timestamp: Date.now() }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.collection<PortfolioDoc>('portfolio').insertOne(portfolio);
  }

  return portfolio;
}

async function savePortfolio(portfolio: PortfolioDoc): Promise<void> {
  const db = await getDb();
  await db.collection<PortfolioDoc>('portfolio').updateOne(
    { userId: 'default' },
    { $set: { ...portfolio, updatedAt: Date.now() } },
    { upsert: true }
  );
}

export async function getStats(): Promise<PortfolioStats> {
  const portfolio = await getPortfolio();
  const db = await getDb();

  // Fetch real live prices from Polymarket CLOB for each position
  const positions = await Promise.all(portfolio.positions.map(async (p) => {
    let current = p.current; // fallback to last known price

    try {
      // Look up the YES token ID from stored market data
      const stored = await db.collection('markets').findOne(
        { conditionId: p.marketId },
        { projection: { tokens: 1 } },
      );
      const yesToken = stored?.tokens?.find(
        (t: { outcome: string; token_id: string }) => t.outcome === 'Yes' || t.outcome === 'YES',
      );
      if (yesToken?.token_id) {
        const mid = await getMidpoint(yesToken.token_id);
        if (mid !== null) {
          current = p.direction === 'YES' ? mid : 1 - mid;
        }
      }
    } catch {} // fall back to last known price

    const pnl = (current - p.entry) * p.shares * (p.direction === 'YES' ? 1 : -1);
    const pnlPct = p.entry > 0 ? ((current - p.entry) / p.entry) * 100 * (p.direction === 'YES' ? 1 : -1) : 0;
    return { ...p, current, pnl: Math.round(pnl * 100) / 100, pnlPct: Math.round(pnlPct * 10) / 10 };
  }));

  const invested = positions.reduce((s, p) => s + p.size, 0);
  const totalValue = portfolio.cash + invested + positions.reduce((s, p) => s + p.pnl, 0);
  const totalPnl = totalValue - (portfolio.cash + invested);

  // Equity curve from trades
  const returns = portfolio.trades.map(t => t.pnlPct / 100);
  const equityCurve = computeEquityCurve(returns, INITIAL_BALANCE);

  return {
    cash: portfolio.cash,
    invested,
    totalValue: Math.round(totalValue * 100) / 100,
    totalPnl: Math.round(positions.reduce((s, p) => s + p.pnl, 0) * 100) / 100,
    totalPnlPct: Math.round((positions.reduce((s, p) => s + p.pnl, 0) / Math.max(1, invested)) * 1000) / 10,
    edgeScore: computeSharpe(returns),
    winRate: portfolio.trades.length
      ? Math.round((portfolio.trades.filter(t => t.pnl > 0).length / portfolio.trades.length) * 100)
      : 0,
    positions,
    equityCurve,
  };
}

export async function placeBet(
  marketId: string,
  marketQuestion: string,
  direction: 'YES' | 'NO',
  amount: number,
  price: number,
  strategy: Position['strategy'],
  riskScore: number,
  category?: string
): Promise<{ success: boolean; position?: Position; error?: string }> {
  const portfolio = await getPortfolio();

  if (amount > portfolio.cash) {
    return { success: false, error: 'Insufficient funds' };
  }
  if (amount < 10) {
    return { success: false, error: 'Minimum bet is $10' };
  }

  const shares = amount / price;
  const position: Position = {
    id: nanoid(),
    marketId,
    marketQuestion,
    direction,
    entry: price,
    current: price,
    size: amount,
    shares: Math.round(shares * 1000) / 1000,
    pnl: 0,
    pnlPct: 0,
    riskScore,
    strategy,
    timestamp: Date.now(),
    category,
  };

  portfolio.cash -= amount;
  portfolio.positions.push(position);
  await savePortfolio(portfolio);

  return { success: true, position };
}

export async function closePosition(positionId: string): Promise<{ success: boolean; trade?: TradeRecord; error?: string }> {
  const portfolio = await getPortfolio();
  const idx = portfolio.positions.findIndex(p => p.id === positionId);

  if (idx === -1) return { success: false, error: 'Position not found' };

  const pos = portfolio.positions[idx];
  const exitPrice = pos.current;
  const pnl = pos.pnl;
  const pnlPct = pos.pnlPct;

  const trade: TradeRecord = {
    id: nanoid(),
    marketId: pos.marketId,
    marketQuestion: pos.marketQuestion,
    direction: pos.direction,
    entry: pos.entry,
    exit: exitPrice,
    size: pos.size,
    pnl: Math.round(pnl * 100) / 100,
    pnlPct: Math.round(pnlPct * 10) / 10,
    strategy: pos.strategy,
    timestamp: pos.timestamp,
    closedAt: Date.now(),
  };

  portfolio.cash += pos.size + pnl;
  portfolio.positions.splice(idx, 1);
  portfolio.trades.push(trade);
  await savePortfolio(portfolio);

  return { success: true, trade };
}

export async function deposit(amount: number): Promise<{ success: boolean; newBalance: number }> {
  if (amount < 0) return { success: false, newBalance: 0 };
  const portfolio = await getPortfolio();
  portfolio.cash += amount;
  portfolio.deposits.push({ amount, timestamp: Date.now() });
  await savePortfolio(portfolio);
  return { success: true, newBalance: portfolio.cash };
}

export async function getTradeHistory(): Promise<TradeRecord[]> {
  const portfolio = await getPortfolio();
  return portfolio.trades.slice().reverse();
}

// ─── Apply intel risk delta to matching open positions ────────────────────────
// Searches open positions whose marketQuestion contains keywords from the claim.
// Adjusts riskScore by riskDelta, clamped to 0–100.
// Returns how many positions were updated.
export async function applyIntelToPositions(
  claim: string,
  riskDelta: number,
): Promise<{ updated: number; positions: Array<{ id: string; marketQuestion: string; oldRisk: number; newRisk: number }> }> {
  if (riskDelta === 0) return { updated: 0, positions: [] };

  const portfolio = await getPortfolio();

  // Build keywords from claim (words longer than 4 chars, lowercase)
  const keywords = claim
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4);

  if (!keywords.length) return { updated: 0, positions: [] };

  const affected: Array<{ id: string; marketQuestion: string; oldRisk: number; newRisk: number }> = [];

  portfolio.positions = portfolio.positions.map(pos => {
    const q = pos.marketQuestion.toLowerCase();
    const matches = keywords.some(kw => q.includes(kw));
    if (!matches) return pos;

    const oldRisk = pos.riskScore;
    const newRisk = Math.max(0, Math.min(100, oldRisk + riskDelta));
    affected.push({ id: pos.id, marketQuestion: pos.marketQuestion, oldRisk, newRisk });
    return { ...pos, riskScore: newRisk };
  });

  if (affected.length > 0) {
    await savePortfolio(portfolio);
  }

  return { updated: affected.length, positions: affected };
}
