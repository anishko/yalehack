import { NextResponse } from 'next/server';
import { optimizeStrategyBlend } from '@/lib/alpha/optimizer';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await optimizeStrategyBlend(90);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
