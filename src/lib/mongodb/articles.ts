import { getDb } from './client';
import { cosineSimilarity } from '@/lib/embeddings';

interface StoredArticle {
  title: string;
  source: string;
  embedding: number[];
  timestamp: number;
  ingestedAt: Date;
}

export async function saveArticle(
  title: string,
  source: string,
  embedding: number[]
): Promise<void> {
  const db = await getDb();
  const col = db.collection<StoredArticle>('articles');
  await col.insertOne({
    title,
    source,
    embedding,
    timestamp: Date.now(),
    ingestedAt: new Date(),
  } as any);
}

export async function isDuplicate(embedding: number[]): Promise<boolean> {
  const db = await getDb();

  // Try vector search first
  try {
    const results = await db.collection('articles').aggregate([
      {
        $vectorSearch: {
          index: 'articles_vector_index',
          path: 'embedding',
          queryVector: embedding,
          numCandidates: 20,
          limit: 1,
        },
      },
      {
        $project: {
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]).toArray();

    if (results.length > 0 && results[0].score > 0.9) {
      return true;
    }
    return false;
  } catch {
    // Fallback: brute-force cosine similarity against recent articles
    const recent = await db.collection<StoredArticle>('articles')
      .find({})
      .sort({ timestamp: -1 })
      .limit(200)
      .project({ embedding: 1 })
      .toArray();

    for (const article of recent) {
      if (article.embedding && cosineSimilarity(embedding, article.embedding) > 0.9) {
        return true;
      }
    }
    return false;
  }
}
