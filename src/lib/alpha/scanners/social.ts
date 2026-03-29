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

    // FinBERT-powered sentiment gap detection
    // Use FinBERT score to weight confidence — higher score = more conviction
    const socialBullish = signal.sentiment === 'bullish';
    const marketBullish = mid > 0.5;
    const hasGap = socialBullish !== marketBullish;

    // FinBERT confidence: only boost meaningfully if we have directional signal
    const finbertBoost = signal.sentiment !== 'neutral'
      ? Math.round(signal.finbertScore * 20) // 0-20 pts when directional
      : Math.round(signal.finbertScore * 5);  // 0-5 pts when neutral (low boost)

    // Article count with diminishing returns (not linear cap)
    const articleBoost = Math.round(Math.log1p(signal.articleCount) * 10); // ~23 for 10, ~7 for 1

    // Reddit engagement — log scale for granularity across wide range
    const redditBoost = Math.min(15, Math.round(Math.log1p(signal.redditScore) * 1.5));

    // Market price distance from 0.5 — further = more market conviction to disagree with
    const priceConviction = Math.round(Math.abs(mid - 0.5) * 30); // 0-15 pts

    const baseConfidence = 30 + articleBoost + redditBoost + priceConviction + finbertBoost;
    const gapBonus = hasGap ? 8 : 0;
    const confidence = Math.round(Math.min(92, baseConfidence + gapBonus));

    const direction = signal.sentiment === 'bullish' ? 'YES' : 'NO';
    // Scale edge by FinBERT confidence — higher conviction = larger expected edge
    const finbertEdgeMultiplier = 0.8 + signal.finbertScore * 0.4; // 0.8x to 1.2x
    const expectedEdge = ((hasGap ? 0.04 : 0.015) + Math.min(0.06, velocity * 0.008) + Math.abs(mid - 0.5) * 0.05) * finbertEdgeMultiplier;

    signals.push({
      id: nanoid(),
      scannerType: 'SOCIAL',
      marketId: market.conditionId,
      marketQuestion: market.question,
      direction,
      confidence,
      expectedEdge: Math.round(expectedEdge * 10000) / 10000,
      riskScore: Math.max(10, 65 - signal.articleCount * 3 - finbertBoost),
      edgeScore: Math.round(Math.min(3.0, (confidence / 100) * (1 + Math.abs(mid - 0.5)) * finbertEdgeMultiplier + (hasGap ? 0.3 : 0) + Math.log1p(velocity) * 0.2) * 100) / 100,
      summary: `${signal.articleCount} articles, Reddit score ${signal.redditScore} — FinBERT: ${signal.finbertLabel} (${(signal.finbertScore * 100).toFixed(0)}%)${hasGap ? ' vs market price' : ''}`,
      details: `Topic: "${topic}" | FinBERT sentiment: ${signal.finbertLabel} (score: ${signal.finbertScore.toFixed(3)}) | Headlines: ${signal.headlines.slice(0, 2).join('; ')} | Sources: ${signal.sources.join(', ')}`,
      timestamp: Date.now(),
      marketPrice: mid,
      category: market.category,
    });
  }

  return signals.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
}
