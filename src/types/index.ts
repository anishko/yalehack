// ─── Polymarket ───────────────────────────────────────────────────────────────

export interface PolymarketToken {
  token_id: string;
  outcome: string;
  price?: number;
  winner?: boolean;
}

export interface PolymarketMarket {
  id: string;
  conditionId: string;
  question: string;
  description?: string;
  category?: string;
  slug?: string;
  startDate?: string;
  endDate?: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  volume?: number;
  liquidity?: number;
  tokens: PolymarketToken[];
  outcomes?: string[];
  outcomePrices?: string[];
  tags?: string[];
  // enriched
  midPrice?: number;
  spread?: number;
  lastPrice?: number;
  priceHistory?: PricePoint[];
  riskScore?: number;
  signals?: RankedSignal[];
}

export interface PricePoint {
  t: number;
  p: number;
}

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

// ─── Alpha / Signals ──────────────────────────────────────────────────────────

export type ScannerType = 'ARB' | 'SPREAD' | 'VELOCITY' | 'DIVERGENCE' | 'SOCIAL' | 'CROSS_DOMAIN' | 'SPORTS' | 'MARCH_MADNESS';

// ─── Sports fine-tuning layer ─────────────────────────────────────────────────

export type PlayerStatusType = 'HEALTHY' | 'QUESTIONABLE' | 'OUT' | 'DAY_TO_DAY';

export interface PlayerStatus {
  name: string;
  team: string;
  status: PlayerStatusType;
  impactScore: number;   // 0-100: how critical this player is
  injuryType?: string;
  minutesReduction?: number; // projected % minutes cut
}

export interface SportsContext {
  sport: string;
  teams: string[];
  keyPlayers: PlayerStatus[];
  seedMatchup?: [number, number];  // March Madness seed numbers
  region?: string;                 // tournament bracket region
  round?: string;                  // e.g. "Sweet 16", "Elite Eight"
  efficiencyDelta?: number;        // offensive efficiency diff
}

export interface RankedSignal {
  id: string;
  scannerType: ScannerType;
  marketId: string;
  marketQuestion: string;
  direction: 'YES' | 'NO' | 'LONG' | 'SHORT';
  confidence: number;          // 0-100
  expectedEdge: number;        // expected profit per dollar
  riskScore: number;           // 0-100
  edgeScore: number;           // Sharpe-like score for this signal
  betSize?: number;            // computed by Kelly
  summary: string;
  details: string;
  timestamp: number;
  category?: string;
  marketPrice?: number;         // live YES price at signal time
  relatedAsset?: string;       // for CROSS_DOMAIN
  intelBoost?: number;         // from verified intel sources
  sportsContext?: SportsContext; // for SPORTS / MARCH_MADNESS
}

// ─── Strategy Performance ─────────────────────────────────────────────────────

export interface StrategyPerformance {
  name: string;
  type: ScannerType;
  returns: number[];
  edgeScore: number;
  winRate: number;
  avgReturn: number;
  maxDrawdown: number;
  profitFactor: number;
  tradeFrequency: number;
  calmar: number;
  tradeCount: number;
}

export interface OptimizedBlend {
  weights: Record<ScannerType, number>;
  blendedEdgeScore: number;
  blendedWinRate: number;
  blendedMaxDrawdown: number;
  blendedProfitFactor: number;
  blendedCalmar: number;
  equityCurve: Array<{ t: number; equity: number }>;
  improvement: string;
  perStrategy: StrategyPerformance[];
}

// ─── Backtest ─────────────────────────────────────────────────────────────────

export interface BacktestTrade {
  timestamp: number;
  market: string;
  direction: string;
  entry: number;
  exit: number;
  returnPct: number;
  pnl: number;
  strategy: ScannerType;
  confidence?: number; // signal confidence at entry (0-100)
}

export interface MonteCarloResult {
  pValue: number;          // % of shuffles that are still profitable
  percentile5: number;     // 5th percentile total return
  percentile95: number;    // 95th percentile total return
}

export interface ConfidenceInterval {
  level: number;        // e.g. 95
  lower: number;        // lower bound return
  upper: number;        // upper bound return
  z: number;
}

export interface BacktestResult {
  edgeScore: number;
  winRate: number;
  profitFactor: number;
  calmar: number;
  maxDrawdown: number;
  totalTrades: number;
  wins: number;
  losses: number;
  inSampleEdgeScore: number;         // Sharpe on in-sample (first 70%) — for reference
  // New: benchmark & alpha
  alpha: number;                    // Jensen's Alpha vs S&P 500
  beta: number;                     // Beta vs S&P 500
  benchmarkReturn: number;          // S&P 500 return same period
  informationRatio: number;         // active return / tracking error
  treynorRatio: number;             // (return - rf) / beta
  treasuryRate: number;             // 10-yr treasury used as RF
  benchmarkEquityCurve: Array<{ t: number; equity: number }>;
  confidenceInterval: ConfidenceInterval;
  avgWin: number;
  avgLoss: number;
  totalReturn: number;
  // New metrics
  brierScore: number;                // calibration accuracy (lower = better)
  sortinoRatio: number;              // Sharpe but only penalises downside vol
  edgePerDollar: number;             // average return per dollar risked
  monteCarlo: MonteCarloResult;      // bootstrap p-value and percentile bounds
  equityCurve: Array<{ t: number; equity: number }>;
  categoryBreakdown: Array<{ category: string; trades: number; winRate: number; pnl: number }>;
  trades: BacktestTrade[];
}

// ─── Intel / Verify ───────────────────────────────────────────────────────────

export type ReliabilityTier = 'VERIFIED' | 'LIKELY' | 'UNCERTAIN' | 'UNVERIFIED';

export interface IntelEntry {
  id: string;
  raw: string;
  type: 'url' | 'tip' | 'social' | 'freeform';
  claim: string;
  reliability: number;        // 0-100
  tier: ReliabilityTier;
  sources: number;
  riskDelta: number;          // positive = raises risk, negative = lowers
  relatedMarkets: string[];
  timestamp: number;
  aiAnalysis?: string;
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export interface Position {
  id: string;
  marketId: string;
  marketQuestion: string;
  direction: 'YES' | 'NO';
  entry: number;
  current: number;
  size: number;               // dollar amount
  shares: number;
  pnl: number;
  pnlPct: number;
  riskScore: number;
  strategy: ScannerType;
  timestamp: number;
  category?: string;
}

export interface TradeRecord {
  id: string;
  marketId: string;
  marketQuestion: string;
  direction: 'YES' | 'NO';
  entry: number;
  exit: number;
  size: number;
  pnl: number;
  pnlPct: number;
  strategy: ScannerType;
  timestamp: number;
  closedAt?: number;
}

export interface PortfolioStats {
  cash: number;
  invested: number;
  totalValue: number;
  totalPnl: number;
  totalPnlPct: number;
  edgeScore: number;
  winRate: number;
  positions: Position[];
  equityCurve: Array<{ t: number; equity: number }>;
}

// ─── Portfolio Monte Carlo ────────────────────────────────────────────────

export interface PortfolioMonteCarloResult {
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  profitProbability: number;   // % of simulations that ended profitable
  expectedValue: number;       // mean final return as %
  paths: number[][];           // sample of ~100 equity paths for charting
}

// ─── Finance ──────────────────────────────────────────────────────────────────

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
}

export interface NewsItem {
  headline: string;
  source: string;
  url: string;
  datetime: number;
  summary: string;
  category?: string;
}

// ─── MongoDB stored market ────────────────────────────────────────────────────

export interface StoredMarket {
  _id?: string;
  conditionId: string;
  question: string;
  description?: string;
  category?: string;
  tags?: string[];
  active: boolean;
  volume?: number;
  liquidity?: number;
  tokens: PolymarketToken[];
  embedding?: number[];
  ingestedAt: number;
  updatedAt: number;
}
