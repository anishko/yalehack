import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketById } from '@/lib/polymarket/gamma';
import { enrichMarket } from '@/lib/polymarket/enricher';
import { getPricesHistory, getOrderbook } from '@/lib/polymarket/clob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const gamma = await fetchMarketById(id);
    if (!gamma) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const enriched = await enrichMarket(gamma);

    // Fetch price history + orderbook for detail page
    const yesToken = enriched.tokens.find(t => t.outcome === 'Yes' || t.outcome === 'YES');
    if (yesToken?.token_id) {
      const [history, orderbook] = await Promise.allSettled([
        getPricesHistory(yesToken.token_id, '1w', 60),
        getOrderbook(yesToken.token_id),
      ]);
      enriched.priceHistory = history.status === 'fulfilled' ? history.value : [];
      if (orderbook.status === 'fulfilled' && orderbook.value) {
        (enriched as typeof enriched & { orderbook: unknown }).orderbook = orderbook.value;
      }
    }

    return NextResponse.json({ market: enriched });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
