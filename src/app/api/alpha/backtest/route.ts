import { NextRequest, NextResponse } from 'next/server';
import { computeBacktest } from '@/lib/alpha/backtest';
import type { ScannerType } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { scannerType, lookbackDays = 90, weights } = await req.json();
    const result = await computeBacktest(scannerType as ScannerType | 'BLENDED', lookbackDays, weights);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
