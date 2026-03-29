import { NextRequest } from 'next/server';
import { fetchActiveMarkets } from '@/lib/polymarket/gamma';
import { enrichMarkets } from '@/lib/polymarket/enricher';
import { runAllScanners } from '@/lib/alpha/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: 'scanning', message: 'Fetching markets...' });

        const markets = await fetchActiveMarkets(30);
        const enriched = await enrichMarkets(markets);

        send({ type: 'scanning', message: `Scanning ${enriched.length} markets...` });

        const result = await runAllScanners(enriched);

        send({ type: 'signals', ...result });
        send({ type: 'done' });
      } catch (err) {
        send({ type: 'error', message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
