const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const API_KEY = process.env.FINNHUB_API_KEY!;

async function finnhubFetch<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${FINNHUB_BASE}${path}${sep}token=${API_KEY}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${path}`);
  return res.json();
}

export interface FinnhubQuote {
  c: number;  // current
  d: number;  // change
  dp: number; // change pct
  h: number;  // high
  l: number;  // low
  o: number;  // open
  pc: number; // prev close
}

export async function getQuote(symbol: string): Promise<FinnhubQuote | null> {
  try {
    return await finnhubFetch<FinnhubQuote>(`/quote?symbol=${symbol}`);
  } catch {
    return null;
  }
}

export interface FinnhubNews {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

export async function getMarketNews(category = 'general'): Promise<FinnhubNews[]> {
  try {
    return await finnhubFetch<FinnhubNews[]>(`/news?category=${category}`);
  } catch {
    return [];
  }
}

export async function getCompanyNews(symbol: string, from: string, to: string): Promise<FinnhubNews[]> {
  try {
    return await finnhubFetch<FinnhubNews[]>(`/company-news?symbol=${symbol}&from=${from}&to=${to}`);
  } catch {
    return [];
  }
}

// Tickers tracked for cross-domain correlation
export const TRACKED_ASSETS = [
  { symbol: 'SPY',  label: 'S&P 500',  category: 'indices' },
  { symbol: 'QQQ',  label: 'NASDAQ',   category: 'indices' },
  { symbol: 'BTC',  label: 'Bitcoin',  category: 'crypto', finnhub: 'BINANCE:BTCUSDT' },
  { symbol: 'ETH',  label: 'Ethereum', category: 'crypto', finnhub: 'BINANCE:ETHUSDT' },
  { symbol: 'XOM',  label: 'Oil/ExxonMobil', category: 'energy' },
  { symbol: 'GLD',  label: 'Gold',     category: 'commodities' },
  { symbol: 'LMT',  label: 'Lockheed Martin', category: 'defense' },
  { symbol: 'RTX',  label: 'Raytheon', category: 'defense' },
  { symbol: 'NVDA', label: 'NVIDIA',   category: 'tech' },
  { symbol: 'TSLA', label: 'Tesla',    category: 'tech' },
];

export const ASSET_MARKET_KEYWORDS: Record<string, string[]> = {
  XOM:  ['oil', 'energy', 'opec', 'crude', 'gasoline'],
  BTC:  ['bitcoin', 'btc', 'crypto', 'cryptocurrency'],
  ETH:  ['ethereum', 'eth', 'crypto', 'defi'],
  LMT:  ['war', 'conflict', 'military', 'defense', 'nato', 'invasion'],
  RTX:  ['war', 'conflict', 'military', 'defense', 'missile'],
  GLD:  ['gold', 'inflation', 'fed', 'federal reserve', 'recession'],
  NVDA: ['ai', 'nvidia', 'chip', 'artificial intelligence', 'gpu'],
  TSLA: ['tesla', 'musk', 'ev', 'electric vehicle'],
  SPY:  ['recession', 'economy', 'ath', 'stock market', 'gdp'],
  QQQ:  ['tech', 'nasdaq', 'ai', 'software'],
};

export async function getOverview(): Promise<Array<{ symbol: string; label: string; quote: FinnhubQuote | null }>> {
  const results = await Promise.allSettled(
    TRACKED_ASSETS.map(async asset => ({
      symbol: asset.symbol,
      label: asset.label,
      quote: await getQuote(asset.finnhub || asset.symbol),
    }))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<{ symbol: string; label: string; quote: FinnhubQuote | null }>).value);
}
