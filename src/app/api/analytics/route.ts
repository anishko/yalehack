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

// POST to recompute correlations — protected by admin secret
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('secret');
  const expected = process.env.ADMIN_SECRET || 'lineup-admin';
  if (secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await computeCorrelations();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
