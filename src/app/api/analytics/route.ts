import { NextRequest, NextResponse } from 'next/server';
import { getCategoryAnalytics, computeCorrelations, getCorrelationMatrix } from '@/lib/mongodb/analytics';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const days = Number(req.nextUrl.searchParams.get('days') ?? 7);

    const [analytics, correlations] = await Promise.allSettled([
      getCategoryAnalytics(days),
      getCorrelationMatrix(),
    ]);

    return NextResponse.json({
      ...(analytics.status === 'fulfilled' ? analytics.value : { byCategory: [], overall: {}, topSignals: [] }),
      correlations: correlations.status === 'fulfilled' ? correlations.value : [],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST to recompute correlations
export async function POST() {
  try {
    await computeCorrelations();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
