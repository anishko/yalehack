import { NextRequest, NextResponse } from 'next/server';
import { getQuote } from '@/lib/finnhub/client';

export async function GET(req: NextRequest) {
  const symbol = new URL(req.url).searchParams.get('symbol') || 'SPY';
  try {
    const quote = await getQuote(symbol);
    return NextResponse.json({ symbol, quote });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
