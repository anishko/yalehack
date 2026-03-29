import { NextRequest, NextResponse } from 'next/server';
import { getStats, placeBet } from '@/lib/portfolio/manager';
import type { ScannerType } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = await getStats();
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { marketId, marketQuestion, direction, amount, price, strategy, riskScore, category } = await req.json();
    const result = await placeBet(
      marketId, marketQuestion, direction as 'YES' | 'NO',
      amount, price, strategy as ScannerType, riskScore, category
    );
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
