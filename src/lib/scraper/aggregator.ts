import { searchGoogleNews, fetchOutletRSS, RSS_FEEDS, type NewsArticle } from './google-news';
import { fetchSubreddit, TRACKED_SUBREDDITS, type RedditPost } from './reddit';
import { classifyBatch, toMarketSentiment, type SentimentResult } from '@/lib/ml/finbert';

export interface AggregatedSignal {
  topic: string;
  articleCount: number;
  redditScore: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  finbertScore: number;         // FinBERT confidence (0-1) for the dominant sentiment
  finbertLabel: SentimentResult['label']; // raw FinBERT label
  headlines: string[];
  sources: string[];
  velocity: number; // articles per hour
}

export async function aggregateTopicSignal(topic: string): Promise<AggregatedSignal> {
  const [news, ...redditResults] = await Promise.allSettled([
    searchGoogleNews(topic),
    ...TRACKED_SUBREDDITS.slice(0, 3).map(sub => fetchSubreddit(sub, 10)),
  ]);

  const articles: NewsArticle[] = news.status === 'fulfilled' ? news.value : [];
  const redditPosts: RedditPost[] = redditResults
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => (r as PromiseFulfilledResult<RedditPost[]>).value)
    .filter(p => p.title.toLowerCase().includes(topic.toLowerCase()));

  const redditScore = redditPosts.reduce((s, p) => s + p.score, 0);
  const headlines = articles.map(a => a.title).slice(0, 5);

  // ─── FinBERT sentiment classification ─────────────────────────────────────
  // Combine article headlines and Reddit titles, then classify via FinBERT.
  const allTexts = [...headlines, ...redditPosts.map(p => p.title)].filter(Boolean);

  let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let finbertScore = 0.5;
  let finbertLabel: SentimentResult['label'] = 'neutral';

  if (allTexts.length > 0) {
    const sentimentResults = await classifyBatch(allTexts);

    // Aggregate: average the scores weighted by label direction
    // positive -> +score, negative -> -score, neutral -> 0
    let weightedSum = 0;
    let totalWeight = 0;
    for (const r of sentimentResults) {
      const weight = r.score;
      if (r.label === 'positive') weightedSum += weight;
      else if (r.label === 'negative') weightedSum -= weight;
      // neutral contributes nothing to direction
      totalWeight += weight;
    }

    const avgDirection = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Map to sentiment
    if (avgDirection > 0.15) {
      sentiment = 'bullish';
      finbertLabel = 'positive';
      finbertScore = Math.abs(avgDirection);
    } else if (avgDirection < -0.15) {
      sentiment = 'bearish';
      finbertLabel = 'negative';
      finbertScore = Math.abs(avgDirection);
    } else {
      sentiment = 'neutral';
      finbertLabel = 'neutral';
      finbertScore = 1 - Math.abs(avgDirection); // high score = confidently neutral
    }
  }

  // Velocity: articles published in last 2 hours
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  const recentCount = articles.filter(a => a.pubDate && new Date(a.pubDate).getTime() > twoHoursAgo).length;

  return {
    topic,
    articleCount: articles.length,
    redditScore,
    sentiment,
    finbertScore,
    finbertLabel,
    headlines,
    sources: [...new Set(articles.map(a => a.source || 'Unknown'))],
    velocity: recentCount / 2,
  };
}

export async function fetchAllOutlets(): Promise<NewsArticle[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(feed => fetchOutletRSS(feed.url, feed.source))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => (r as PromiseFulfilledResult<NewsArticle[]>).value);
}
