import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { fetchActiveMarkets } from '@/lib/polymarket/gamma';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    const markets = await fetchActiveMarkets(50);
    const sample = markets.slice(0, 20).map(m => m.question).join('\n');

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `User is searching for: "${query}"\n\nActive markets:\n${sample}\n\nSuggest 3 relevant markets from the list above. Return only the market questions, one per line.`,
      }],
    });

    const suggestions = ((msg.content[0] as { text: string }).text).split('\n').filter(Boolean).slice(0, 3);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
