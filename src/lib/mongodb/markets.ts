import { getDb } from './client';
import { getBatchEmbeddings } from '@/lib/embeddings';
import type { StoredMarket } from '@/types';

export async function upsertMarket(market: StoredMarket): Promise<void> {
  const db = await getDb();
  const col = db.collection<StoredMarket>('markets');
  await col.updateOne(
    { conditionId: market.conditionId },
    { $set: { ...market, updatedAt: Date.now() } },
    { upsert: true }
  );
}

export async function upsertMarkets(markets: StoredMarket[]): Promise<void> {
  if (!markets.length) return;
  const db = await getDb();
  const col = db.collection<StoredMarket>('markets');

  // Auto-embed markets that don't have embeddings yet
  const needsEmbedding = markets.filter(m => !m.embedding);
  if (needsEmbedding.length > 0) {
    const BATCH_SIZE = 20;
    for (let i = 0; i < needsEmbedding.length; i += BATCH_SIZE) {
      const batch = needsEmbedding.slice(i, i + BATCH_SIZE);
      const texts = batch.map(m => m.question + (m.description ? ` ${m.description}` : ''));
      try {
        const embeddings = await getBatchEmbeddings(texts);
        batch.forEach((m, idx) => {
          m.embedding = embeddings[idx];
        });
      } catch (err) {
        console.error(`[upsertMarkets] embedding batch ${i} failed:`, err);
        // Continue without embeddings for this batch
      }
    }
  }

  const ops = markets.map(m => ({
    updateOne: {
      filter: { conditionId: m.conditionId },
      update: { $set: { ...m, updatedAt: Date.now() } },
      upsert: true,
    },
  }));
  await col.bulkWrite(ops);
}

export async function getStoredMarkets(limit = 100): Promise<StoredMarket[]> {
  const db = await getDb();
  return db.collection<StoredMarket>('markets')
    .find({ active: true })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray() as unknown as StoredMarket[];
}

export async function vectorSearchMarkets(
  embedding: number[],
  limit = 10
): Promise<StoredMarket[]> {
  const db = await getDb();
  try {
    return db.collection('markets').aggregate([
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: embedding,
          numCandidates: limit * 10,
          limit,
        },
      },
    ]).toArray() as unknown as StoredMarket[];
  } catch {
    // Fallback: text search if vector index not available
    return db.collection<StoredMarket>('markets')
      .find({ active: true })
      .limit(limit)
      .toArray() as unknown as StoredMarket[];
  }
}

export async function textSearchMarkets(query: string, limit = 20): Promise<StoredMarket[]> {
  const db = await getDb();
  try {
    return db.collection<StoredMarket>('markets').aggregate([
      {
        $search: {
          index: 'default',
          text: {
            query,
            path: ['question', 'description', 'category'],
            fuzzy: {},
          },
        },
      },
      { $limit: limit },
    ]).toArray() as unknown as StoredMarket[];
  } catch {
    // Regex fallback
    return db.collection<StoredMarket>('markets')
      .find({
        $or: [
          { question: { $regex: query, $options: 'i' } },
          { category: { $regex: query, $options: 'i' } },
        ],
        active: true,
      })
      .limit(limit)
      .toArray() as unknown as StoredMarket[];
  }
}

export async function ensureIndexes(): Promise<void> {
  const db = await getDb();
  const col = db.collection('markets');
  await col.createIndex({ conditionId: 1 }, { unique: true });
  await col.createIndex({ active: 1, updatedAt: -1 });
  await col.createIndex({ category: 1 });
}

export async function ensureAllIndexes(): Promise<void> {
  const db = await getDb();

  // Markets collection — existing + TTL
  const markets = db.collection('markets');
  await markets.createIndex({ conditionId: 1 }, { unique: true });
  await markets.createIndex({ active: 1, updatedAt: -1 });
  await markets.createIndex({ category: 1 });
  await markets.createIndex({ updatedAt: 1 }, { expireAfterSeconds: 86400 }); // 24h TTL

  // Signals collection
  const signals = db.collection('signals');
  await signals.createIndex({ scannerType: 1, timestamp: -1 });

  // Intel collection
  const intel = db.collection('intel');
  await intel.createIndex({ timestamp: -1 });

  // Articles collection
  const articles = db.collection('articles');
  await articles.createIndex({ timestamp: -1 });
  await articles.createIndex({ ingestedAt: 1 }, { expireAfterSeconds: 604800 }); // 7 days TTL

  // Correlations collection
  const correlations = db.collection('correlations');
  await correlations.createIndex({ category1: 1, category2: 1 }, { unique: true });
  await correlations.createIndex({ computedAt: -1 });
}
