import { NextRequest, NextResponse } from 'next/server';
import { getMarketNews } from '@/lib/finnhub/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const category = new URL(req.url).searchParams.get('category') || 'general';
  try {
    const news = await getMarketNews(category);
    return NextResponse.json({ news: news.slice(0, 20) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
