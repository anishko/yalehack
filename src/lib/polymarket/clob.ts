const CLOB_BASE = 'https://clob.polymarket.com';

async function clobFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${CLOB_BASE}${path}`, {
    headers: { 'User-Agent': 'Lineup/1.0' },
    next: { revalidate: 15 },
  });
  if (!res.ok) throw new Error(`CLOB ${res.status}: ${path}`);
  return res.json();
}

export async function getMidpoint(tokenId: string): Promise<number | null> {
  try {
    const data = await clobFetch<{ mid: string }>(`/midpoint?token_id=${tokenId}`);
    return parseFloat(data.mid);
  } catch {
    return null;
  }
}

export async function getPrice(tokenId: string, side: 'BUY' | 'SELL' = 'BUY'): Promise<number | null> {
  try {
    const data = await clobFetch<{ price: string }>(`/price?token_id=${tokenId}&side=${side}`);
    return parseFloat(data.price);
  } catch {
    return null;
  }
}

export async function getSpread(tokenId: string): Promise<number | null> {
  try {
    const data = await clobFetch<{ spread: string }>(`/spread?token_id=${tokenId}`);
    return parseFloat(data.spread);
  } catch {
    return null;
  }
}

export async function getOrderbook(tokenId: string): Promise<{ bids: Array<{price:number;size:number}>; asks: Array<{price:number;size:number}> } | null> {
  try {
    const data = await clobFetch<{
      bids: Array<{price: string; size: string}>;
      asks: Array<{price: string; size: string}>;
    }>(`/book?token_id=${tokenId}`);
    return {
      bids: (data.bids || []).map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) })),
      asks: (data.asks || []).map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) })),
    };
  } catch {
    return null;
  }
}

export async function getLastTradePrice(tokenId: string): Promise<number | null> {
  try {
    const data = await clobFetch<{ price: string }>(`/last-trade-price?token_id=${tokenId}`);
    return parseFloat(data.price);
  } catch {
    return null;
  }
}

export async function getPricesHistory(tokenId: string, interval = '1d', fidelity = 60): Promise<Array<{t: number; p: number}>> {
  try {
    const data = await clobFetch<{ history: Array<{t: number; p: number}> }>(
      `/prices-history?market=${tokenId}&interval=${interval}&fidelity=${fidelity}`
    );
    return data.history || [];
  } catch {
    return [];
  }
}

export async function batchPrices(
  items: Array<{ token_id: string; side: 'BUY' | 'SELL' }>
): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${CLOB_BASE}/prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Lineup/1.0' },
      body: JSON.stringify(items),
      next: { revalidate: 15 },
    });
    if (!res.ok) return {};
    const data = await res.json() as Record<string, string>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(data)) out[k] = parseFloat(v as string);
    return out;
  } catch {
    return {};
  }
}
