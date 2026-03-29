import { getDb } from './client';
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
