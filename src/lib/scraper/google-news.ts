import RSSParser from 'rss-parser';
import { getEmbedding } from '@/lib/embeddings';
import { isDuplicate, saveArticle } from '@/lib/mongodb/articles';

const parser = new RSSParser();

export interface NewsArticle {
  title: string;
  link: string;
  pubDate?: string;
  content?: string;
  source?: string;
}

export async function searchGoogleNews(query: string): Promise<NewsArticle[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const feed = await Promise.race([
      parser.parseURL(url),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    const raw = ((feed as RSSParser.Output<{}>).items || []).slice(0, 10).map(item => ({
      title: item.title || '',
      link: item.link || '',
      pubDate: item.pubDate,
      content: item.contentSnippet || item.content || '',
      source: 'Google News',
    }));

    // Dedup: embed each article title and check against stored articles
    const deduped: NewsArticle[] = [];
    for (const article of raw) {
      try {
        const embedding = await getEmbedding(article.title);
        const dup = await isDuplicate(embedding);
        if (!dup) {
          deduped.push(article);
          await saveArticle(article.title, article.source || 'Google News', embedding);
        }
      } catch {
        // If embedding/dedup fails, include the article anyway
        deduped.push(article);
      }
    }
    return deduped;
  } catch {
    return [];
  }
}

export async function fetchOutletRSS(url: string, source: string): Promise<NewsArticle[]> {
  try {
    const feed = await Promise.race([
      parser.parseURL(url),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    return ((feed as RSSParser.Output<{}>).items || []).slice(0, 5).map(item => ({
      title: item.title || '',
      link: item.link || '',
      pubDate: item.pubDate,
      content: item.contentSnippet || '',
      source,
    }));
  } catch {
    return [];
  }
}

export const RSS_FEEDS = [
  { url: 'https://feeds.reuters.com/reuters/topNews', source: 'Reuters' },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', source: 'NYT' },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
];
