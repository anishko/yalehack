import { NextRequest, NextResponse } from 'next/server';
import { factCheck } from '@/lib/verify/fact-checker';
import { applyIntelToPositions } from '@/lib/portfolio/manager';

export async function POST(req: NextRequest) {
  try {
    const { raw, marketQuestion } = await req.json();
    if (!raw?.trim()) return NextResponse.json({ error: 'Empty input' }, { status: 400 });

    const result = await factCheck(raw, marketQuestion);

    // Auto-apply risk delta to any matching open positions
    const impact = await applyIntelToPositions(result.claim, result.riskDelta).catch(() => ({ updated: 0, positions: [] }));

    return NextResponse.json({ ...result, portfolioImpact: impact });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
