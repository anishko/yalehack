import RSSParser from 'rss-parser';

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
    return ((feed as RSSParser.Output<{}>).items || []).slice(0, 10).map(item => ({
      title: item.title || '',
      link: item.link || '',
      pubDate: item.pubDate,
      content: item.contentSnippet || item.content || '',
      source: 'Google News',
    }));
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
