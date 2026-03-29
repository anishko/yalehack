import { NextRequest, NextResponse } from 'next/server';
import { optimizeStrategyBlend } from '@/lib/alpha/optimizer';

export async function POST(req: NextRequest) {
  try {
    const { lookbackDays = 90 } = await req.json().catch(() => ({}));
    const result = await optimizeStrategyBlend(lookbackDays);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
