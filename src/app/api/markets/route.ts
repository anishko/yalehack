import { NextRequest, NextResponse } from 'next/server';
import { fetchActiveMarkets, searchMarkets } from '@/lib/polymarket/gamma';
import { enrichMarkets } from '@/lib/polymarket/enricher';
import { upsertMarkets, cleanStaleMarkets } from '@/lib/mongodb/markets';
import type { StoredMarket } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const category = searchParams.get('category') || '';
    const sort = searchParams.get('sort') || 'volume';
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '24'));

    const gammaMarkets = q
      ? await searchMarkets(q, limit)
      : await fetchActiveMarkets(limit);

    let enriched = await enrichMarkets(gammaMarkets);

    if (category) {
      enriched = enriched.filter(m => m.category?.toLowerCase() === category.toLowerCase());
    }

    if (sort === 'volume') {
      enriched.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    } else if (sort === 'liquidity') {
      enriched.sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0));
    } else if (sort === 'risk') {
      enriched.sort((a, b) => (a.riskScore ?? 50) - (b.riskScore ?? 50));
    }

    // Persist to MongoDB with auto-embedding (non-blocking)
    // This populates the vector search index so intel sidebar can find related contracts
    const storedMarkets: StoredMarket[] = enriched.map(m => ({
      conditionId: m.conditionId,
      question: m.question,
      description: m.description,
      category: m.category,
      tags: m.tags,
      active: m.active,
      volume: m.volume,
      liquidity: m.liquidity,
      tokens: m.tokens,
      ingestedAt: Date.now(),
      updatedAt: Date.now(),
    }));
    upsertMarkets(storedMarkets).catch(err =>
      console.error('[markets] failed to persist/embed:', err)
    );
    // Clean markets not updated in the last 48 hours (expired/closed)
    cleanStaleMarkets().catch(() => {});

    return NextResponse.json({ markets: enriched, total: enriched.length });
  } catch (err) {
    console.error('Markets route error:', err);
    return NextResponse.json({ markets: [], total: 0, error: String(err) }, { status: 500 });
  }
}
