import { getDb } from './client';
import type { RankedSignal } from '@/types';

export async function saveSignals(signals: RankedSignal[]): Promise<void> {
  if (!signals.length) return;
  const db = await getDb();
  const col = db.collection<RankedSignal>('signals');
  await col.insertMany(signals.map(s => ({ ...s })) as any[]);
}

export async function getRecentSignals(limit = 50): Promise<RankedSignal[]> {
  const db = await getDb();
  return db.collection<RankedSignal>('signals')
    .find({})
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray() as unknown as RankedSignal[];
}
