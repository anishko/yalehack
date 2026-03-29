import { getDb } from './client';
import type { IntelEntry } from '@/types';

export async function saveIntelEntry(entry: IntelEntry): Promise<void> {
  const db = await getDb();
  const col = db.collection<IntelEntry>('intel');
  await col.insertOne({ ...entry } as any);
}

export async function getRecentIntel(limit = 50): Promise<IntelEntry[]> {
  const db = await getDb();
  return db.collection<IntelEntry>('intel')
    .find({})
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray() as unknown as IntelEntry[];
}
