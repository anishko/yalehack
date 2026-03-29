import { NextRequest, NextResponse } from 'next/server';
import { fetchActiveMarkets } from '@/lib/polymarket/gamma';
import { enrichMarkets } from '@/lib/polymarket/enricher';
import { runAllScanners, runScanner } from '@/lib/alpha/engine';
import { saveSignals } from '@/lib/mongodb/signals';
import type { ScannerType } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const scannerType = body.scannerType as ScannerType | undefined;
    const limit = Math.min(50, body.limit || 30);

    const gammaMarkets = await fetchActiveMarkets(limit);
    const markets = await enrichMarkets(gammaMarkets);

    let result;
    if (scannerType) {
      const signals = await runScanner(scannerType, markets);
      result = { signals, byStrategy: { [scannerType]: signals }, totalSignals: signals.length, timestamp: Date.now() };
    } else {
      result = await runAllScanners(markets);
    }

    // Persist signals to MongoDB
    const allSignals = result.signals ?? [];
    await saveSignals(allSignals).catch(err =>
      console.error('[scan] failed to persist signals:', err)
    );

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
