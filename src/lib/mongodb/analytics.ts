import { getDb } from './client';

// ─── Category Analytics Aggregation Pipeline ──────────────────────────────────
// Runs entirely server-side in MongoDB — no data pulled to Node.js until the
// final result. Demonstrates $match, $group, $lookup, $facet, $sort, $project.

export interface CategoryAnalytics {
  category: string;
  signalCount: number;
  avgConfidence: number;
  avgEdgeScore: number;
  totalPnl: number;
  winRate: number;
  wins: number;
  losses: number;
}

export interface AnalyticsSummary {
  byCategory: CategoryAnalytics[];
  overall: {
    totalSignals: number;
    totalTrades: number;
    avgConfidence: number;
    avgEdgeScore: number;
    profitableCategories: number;
    bestCategory: string;
  };
  topSignals: Array<{
    marketQuestion: string;
    scannerType: string;
    confidence: number;
    edgeScore: number;
    timestamp: number;
  }>;
}

export async function getCategoryAnalytics(daysBack = 7): Promise<AnalyticsSummary> {
  const db = await getDb();
  const cutoff = Date.now() - daysBack * 86400000;

  const result = await db.collection('signals').aggregate([
    // Stage 1: Filter to recent signals
    { $match: { timestamp: { $gte: cutoff } } },

    // Stage 2: $facet — run three sub-pipelines in parallel on the same dataset
    {
      $facet: {
        // Pipeline A: Group by category → compute stats per category
        byCategory: [
          {
            $group: {
              _id: '$category',
              signalCount: { $sum: 1 },
              avgConfidence: { $avg: '$confidence' },
              avgEdgeScore: { $avg: '$edgeScore' },
            },
          },
          // $lookup: join with trades to get P&L per category
          {
            $lookup: {
              from: 'trades',
              let: { cat: '$_id' },
              pipeline: [
                { $match: { $expr: { $eq: ['$category', '$$cat'] } } },
                {
                  $group: {
                    _id: null,
                    totalPnl: { $sum: '$pnl' },
                    wins: { $sum: { $cond: [{ $gt: ['$pnl', 0] }, 1, 0] } },
                    losses: { $sum: { $cond: [{ $lte: ['$pnl', 0] }, 1, 0] } },
                  },
                },
              ],
              as: 'tradeStats',
            },
          },
          // Flatten the joined trade stats
          {
            $project: {
              category: '$_id',
              signalCount: 1,
              avgConfidence: { $round: ['$avgConfidence', 1] },
              avgEdgeScore: { $round: ['$avgEdgeScore', 2] },
              totalPnl: {
                $ifNull: [{ $arrayElemAt: ['$tradeStats.totalPnl', 0] }, 0],
              },
              wins: {
                $ifNull: [{ $arrayElemAt: ['$tradeStats.wins', 0] }, 0],
              },
              losses: {
                $ifNull: [{ $arrayElemAt: ['$tradeStats.losses', 0] }, 0],
              },
              winRate: {
                $cond: {
                  if: {
                    $gt: [
                      {
                        $add: [
                          { $ifNull: [{ $arrayElemAt: ['$tradeStats.wins', 0] }, 0] },
                          { $ifNull: [{ $arrayElemAt: ['$tradeStats.losses', 0] }, 0] },
                        ],
                      },
                      0,
                    ],
                  },
                  then: {
                    $round: [
                      {
                        $multiply: [
                          {
                            $divide: [
                              { $ifNull: [{ $arrayElemAt: ['$tradeStats.wins', 0] }, 0] },
                              {
                                $add: [
                                  { $ifNull: [{ $arrayElemAt: ['$tradeStats.wins', 0] }, 0] },
                                  { $ifNull: [{ $arrayElemAt: ['$tradeStats.losses', 0] }, 0] },
                                ],
                              },
                            ],
                          },
                          100,
                        ],
                      },
                      1,
                    ],
                  },
                  else: 0,
                },
              },
            },
          },
          { $sort: { signalCount: -1 } },
        ],

        // Pipeline B: Overall stats across all signals
        overall: [
          {
            $group: {
              _id: null,
              totalSignals: { $sum: 1 },
              avgConfidence: { $avg: '$confidence' },
              avgEdgeScore: { $avg: '$edgeScore' },
              categories: { $addToSet: '$category' },
            },
          },
          {
            $lookup: {
              from: 'trades',
              pipeline: [
                { $match: { timestamp: { $gte: cutoff } } },
                { $count: 'total' },
              ],
              as: 'tradeCount',
            },
          },
          {
            $project: {
              totalSignals: 1,
              avgConfidence: { $round: ['$avgConfidence', 1] },
              avgEdgeScore: { $round: ['$avgEdgeScore', 2] },
              totalTrades: {
                $ifNull: [{ $arrayElemAt: ['$tradeCount.total', 0] }, 0],
              },
              categoryCount: { $size: '$categories' },
            },
          },
        ],

        // Pipeline C: Top 5 highest-confidence recent signals
        topSignals: [
          { $sort: { confidence: -1 } },
          { $limit: 5 },
          {
            $project: {
              _id: 0,
              marketQuestion: 1,
              scannerType: 1,
              confidence: 1,
              edgeScore: 1,
              timestamp: 1,
            },
          },
        ],
      },
    },
  ]).toArray();

  const faceted = result[0] || { byCategory: [], overall: [], topSignals: [] };
  const overallDoc = faceted.overall?.[0] || {};
  const categories = faceted.byCategory || [];

  // Find most profitable category
  const bestCat = [...categories].sort((a: CategoryAnalytics, b: CategoryAnalytics) => b.totalPnl - a.totalPnl)[0];

  return {
    byCategory: categories,
    overall: {
      totalSignals: overallDoc.totalSignals || 0,
      totalTrades: overallDoc.totalTrades || 0,
      avgConfidence: overallDoc.avgConfidence || 0,
      avgEdgeScore: overallDoc.avgEdgeScore || 0,
      profitableCategories: categories.filter((c: CategoryAnalytics) => c.totalPnl > 0).length,
      bestCategory: bestCat?.category || 'N/A',
    },
    topSignals: faceted.topSignals || [],
  };
}

// ─── Correlations Collection ──────────────────────────────────────────────────
// Precomputed price correlation matrices between Polymarket categories.
// Updated periodically — scanners read from here for diversification scoring.

export interface CorrelationEntry {
  category1: string;
  category2: string;
  correlation: number;   // -1 to 1
  sampleSize: number;
  computedAt: number;
}

export async function upsertCorrelation(entry: CorrelationEntry): Promise<void> {
  const db = await getDb();
  await db.collection<CorrelationEntry>('correlations').updateOne(
    { category1: entry.category1, category2: entry.category2 },
    { $set: { ...entry, computedAt: Date.now() } },
    { upsert: true },
  );
}

export async function getCorrelationMatrix(): Promise<CorrelationEntry[]> {
  const db = await getDb();
  return db.collection<CorrelationEntry>('correlations')
    .find({})
    .toArray() as unknown as CorrelationEntry[];
}

// Compute correlations from signal edge scores grouped by category pairs
export async function computeCorrelations(): Promise<void> {
  const db = await getDb();
  const cutoff = Date.now() - 30 * 86400000; // 30 days

  // Get signals grouped by category with their edge scores
  const signals = await db.collection('signals')
    .find({ timestamp: { $gte: cutoff } })
    .project({ category: 1, edgeScore: 1, timestamp: 1 })
    .toArray();

  // Group by category
  const byCat: Record<string, number[]> = {};
  for (const s of signals) {
    const cat = s.category || 'General';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(s.edgeScore);
  }

  const categories = Object.keys(byCat);
  for (let i = 0; i < categories.length; i++) {
    for (let j = i + 1; j < categories.length; j++) {
      const a = byCat[categories[i]];
      const b = byCat[categories[j]];
      const n = Math.min(a.length, b.length);
      if (n < 5) continue;

      const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
      const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
      let cov = 0, varA = 0, varB = 0;
      for (let k = 0; k < n; k++) {
        cov  += (a[k] - meanA) * (b[k] - meanB);
        varA += (a[k] - meanA) ** 2;
        varB += (b[k] - meanB) ** 2;
      }
      const denom = Math.sqrt(varA * varB);
      const corr = denom > 0 ? Math.round((cov / denom) * 1000) / 1000 : 0;

      await upsertCorrelation({
        category1: categories[i],
        category2: categories[j],
        correlation: corr,
        sampleSize: n,
        computedAt: Date.now(),
      });
    }
  }
}
