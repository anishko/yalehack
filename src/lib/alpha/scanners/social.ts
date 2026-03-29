import type { PolymarketMarket, RankedSignal } from '@/types';
import { aggregateTopicSignal } from '@/lib/scraper/aggregator';
import { nanoid } from '../utils';

// Scanner 5: Social Signal Gap
// News/Reddit scraping → topic extraction → price gap scoring

function extractTopics(question: string): string[] {
  const topics: string[] = [];
  const q = question.toLowerCase();

  // Named entities and keywords
  const patterns = [
    /bitcoin|btc/i, /ethereum|eth/i, /donald trump|trump/i,
    /biden|harris|kamala/i, /elon musk|musk/i, /ukraine|russia/i,
    /israel|hamas|gaza/i, /fed|federal reserve/i, /recession/i,
    /nvidia|nvda/i, /apple|aapl/i, /microsoft/i, /openai|gpt/i,
    /election/i, /nato/i, /china/i, /taiwan/i, /oil|opec/i,
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match) topics.push(match[0]);
  }

  // Fallback: first 3 words
  if (topics.length === 0) {
    const words = q.replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 4);
    topics.push(...words.slice(0, 2));
  }

  return [...new Set(topics)];
}

export async function scanSocial(markets: PolymarketMarket[]): Promise<RankedSignal[]> {
  const signals: RankedSignal[] = [];

  // Process in small batches to avoid rate limits
  const sample = markets.slice(0, 20);

  for (const market of sample) {
    if (!market.active || market.closed) continue;
    const topics = extractTopics(market.question);
    if (!topics.length) continue;

    const topic = topics[0];
    const signal = await aggregateTopicSignal(topic);

    // Only surface if we have meaningful signal
    if (signal.articleCount < 2 && signal.redditScore < 50) continue;

    const mid = market.midPrice ?? 0.5;
    const velocity = signal.velocity;

    // Gap: social sentiment != market price direction
    const socialBullish = signal.sentiment === 'bullish';
    const marketBullish = mid > 0.5;
    const hasGap = socialBullish !== marketBullish;

    const baseConfidence = 35 + Math.min(30, signal.articleCount * 5) + Math.min(15, signal.redditScore / 100);
    const gapBonus = hasGap ? 10 : 0;
    const confidence = Math.round(Math.min(80, baseConfidence + gapBonus));

    const direction = signal.sentiment === 'bullish' ? 'YES' : 'NO';
    const expectedEdge = (hasGap ? 0.05 : 0.02) + Math.min(0.08, velocity * 0.01);

    signals.push({
      id: nanoid(),
      scannerType: 'SOCIAL',
      marketId: market.conditionId,
      marketQuestion: market.question,
      direction,
      confidence,
      expectedEdge,
      riskScore: 65 - signal.articleCount * 3,
      edgeScore: Math.min(1.5, (confidence / 100) * 2),
      summary: `${signal.articleCount} articles, Reddit score ${signal.redditScore} — sentiment ${signal.sentiment}${hasGap ? ' vs market price' : ''}`,
      details: `Topic: "${topic}" | Headlines: ${signal.headlines.slice(0, 2).join('; ')} | Sources: ${signal.sources.join(', ')}`,
      timestamp: Date.now(),
      category: market.category,
    });
  }

  return signals.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
}
