const GAMMA_BASE = 'https://gamma-api.polymarket.com';

export interface GammaMarket {
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
  volume?: number | string;
  liquidity?: number | string;
  tokens: Array<{ token_id: string; outcome: string; winner?: boolean }>;
  outcomes?: string;        // JSON-encoded string from gamma
  outcomePrices?: string;   // JSON-encoded string
  clobTokenIds?: string;    // JSON-encoded string: ["YES_TOKEN_ID", "NO_TOKEN_ID"]
  tags?: Array<{ id: string; label?: string; slug?: string }>;
}

async function gammaFetch<T>(path: string): Promise<T> {
  const url = `${GAMMA_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PolyEdge/1.0' },
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`Gamma API ${res.status}: ${path}`);
  return res.json();
}

export async function fetchActiveMarkets(limit = 100, offset = 0): Promise<GammaMarket[]> {
  try {
    return await gammaFetch<GammaMarket[]>(`/markets?active=true&closed=false&limit=${limit}&offset=${offset}`);
  } catch {
    return [];
  }
}

// Polymarket tags sports markets with specific tag IDs.
// This fetches markets for a specific sport category.
const SPORT_TAG_IDS: Record<string, string> = {
  mlb: '100381',
  nhl: '100382',
};

export async function fetchSportsMarkets(sport: string, limit = 100): Promise<GammaMarket[]> {
  const tagId = SPORT_TAG_IDS[sport.toLowerCase()];
  if (!tagId) return [];
  try {
    return await gammaFetch<GammaMarket[]>(`/markets?active=true&closed=false&limit=${limit}&tag_id=${tagId}`);
  } catch {
    return [];
  }
}

export async function searchMarkets(query: string, limit = 20): Promise<GammaMarket[]> {
  try {
    return await gammaFetch<GammaMarket[]>(`/markets?_q=${encodeURIComponent(query)}&active=true&limit=${limit}`);
  } catch {
    return [];
  }
}

export async function fetchMarketById(id: string): Promise<GammaMarket | null> {
  try {
    return await gammaFetch<GammaMarket>(`/markets/${id}`);
  } catch {
    // If numeric ID fails, try by slug
    try {
      const results = await gammaFetch<GammaMarket[]>(`/markets?id=${id}&limit=1`);
      return results?.[0] ?? null;
    } catch {
      return null;
    }
  }
}

export async function fetchResolvedMarkets(limit = 100, offset = 0): Promise<GammaMarket[]> {
  try {
    // Sort by newest first, ascending=false gives most recent closed markets
    // which are more likely to have CLOB price history
    return await gammaFetch<GammaMarket[]>(`/markets?closed=true&order=id&ascending=false&limit=${limit}&offset=${offset}`);
  } catch {
    return [];
  }
}

export async function fetchEvents(limit = 50): Promise<unknown[]> {
  try {
    return await gammaFetch<unknown[]>(`/events?active=true&limit=${limit}`);
  } catch {
    return [];
  }
}

export function parseMarketCategory(market: GammaMarket): string {
  if (market.category) return market.category;
  if (market.tags && market.tags.length > 0) {
    return market.tags[0].label || market.tags[0].slug || 'General';
  }
  const q = market.question.toLowerCase();
  if (q.includes('bitcoin') || q.includes('btc') || q.includes('ethereum') || q.includes('crypto')) return 'Crypto';
  if (q.includes('election') || q.includes('president') || q.includes('senator') || q.includes('vote')) return 'Politics';
  if (q.includes('nba') || q.includes('nfl') || q.includes('mlb') || q.includes('soccer') || q.includes('champion')) return 'Sports';
  if (q.includes('stock') || q.includes('market') || q.includes('fed') || q.includes('rate') || q.includes('gdp')) return 'Finance';
  if (q.includes('war') || q.includes('conflict') || q.includes('military') || q.includes('invasion')) return 'Geopolitics';
  if (q.includes('ai') || q.includes('openai') || q.includes('nvidia') || q.includes('tech')) return 'Tech';
  return 'General';
}
