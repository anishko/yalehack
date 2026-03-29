import { NextResponse } from 'next/server';
import { getTradeHistory } from '@/lib/portfolio/manager';
import { simulatePortfolioFutures } from '@/lib/portfolio/monte-carlo';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const trades = await getTradeHistory();

    if (trades.length === 0) {
      return NextResponse.json(
        { error: 'No trade history available for simulation' },
        { status: 400 },
      );
    }

    const result = simulatePortfolioFutures(trades, 10_000);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
