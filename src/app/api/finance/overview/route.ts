import { NextResponse } from 'next/server';
import { getOverview } from '@/lib/finnhub/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getOverview();
    return NextResponse.json({ assets: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
