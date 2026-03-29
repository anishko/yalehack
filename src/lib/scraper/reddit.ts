export interface RedditPost {
  title: string;
  url: string;
  score: number;
  numComments: number;
  subreddit: string;
  created: number;
  selftext?: string;
}

export async function fetchSubreddit(subreddit: string, limit = 25): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PolyEdge:1.0 (research tool)' },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json() as { data: { children: Array<{ data: { title: string; url: string; score: number; num_comments: number; subreddit: string; created_utc: number; selftext: string } }> } };
    return (data.data?.children || []).map(c => ({
      title: c.data.title,
      url: c.data.url,
      score: c.data.score,
      numComments: c.data.num_comments,
      subreddit: c.data.subreddit,
      created: c.data.created_utc,
      selftext: c.data.selftext,
    }));
  } catch {
    return [];
  }
}

export const TRACKED_SUBREDDITS = [
  'politics', 'worldnews', 'geopolitics',
  'Bitcoin', 'ethereum', 'CryptoCurrency',
  'stocks', 'investing', 'SecurityAnalysis',
  'wallstreetbets',
];
