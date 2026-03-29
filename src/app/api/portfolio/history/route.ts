import { NextResponse } from 'next/server';
import { getTradeHistory } from '@/lib/portfolio/manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const trades = await getTradeHistory();
    return NextResponse.json({ trades });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
