import { searchGoogleNews, fetchOutletRSS, RSS_FEEDS, type NewsArticle } from './google-news';
import { fetchSubreddit, TRACKED_SUBREDDITS, type RedditPost } from './reddit';

export interface AggregatedSignal {
  topic: string;
  articleCount: number;
  redditScore: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
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

  // Simple sentiment: count positive/negative words
  const allText = [...headlines, ...redditPosts.map(p => p.title)].join(' ').toLowerCase();
  const bullishWords = ['win', 'rise', 'surge', 'gain', 'up', 'high', 'positive', 'bullish', 'rally'];
  const bearishWords = ['lose', 'fall', 'drop', 'crash', 'down', 'low', 'negative', 'bearish', 'decline'];

  const bullCount = bullishWords.filter(w => allText.includes(w)).length;
  const bearCount = bearishWords.filter(w => allText.includes(w)).length;
  const sentiment = bullCount > bearCount + 1 ? 'bullish' : bearCount > bullCount + 1 ? 'bearish' : 'neutral';

  // Velocity: articles published in last 2 hours
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  const recentCount = articles.filter(a => a.pubDate && new Date(a.pubDate).getTime() > twoHoursAgo).length;

  return {
    topic,
    articleCount: articles.length,
    redditScore,
    sentiment,
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
