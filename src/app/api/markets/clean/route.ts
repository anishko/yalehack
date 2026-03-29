import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb/client';

export const dynamic = 'force-dynamic';

// Force-clean all stale/old markets from MongoDB
// Hit this once to purge 2020/2021 data: GET /api/markets/clean
export async function GET() {
  try {
    const db = await getDb();

    // Delete markets older than 48 hours
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const byTimestamp = await db.collection('markets').deleteMany({
      updatedAt: { $lt: cutoff },
    });

    // Also delete any markets with endDate in the past (expired/resolved)
    const byEndDate = await db.collection('markets').deleteMany({
      endDate: { $exists: true, $lt: new Date().toISOString() },
    });

    // Also delete any with closed=true or archived=true
    const byClosed = await db.collection('markets').deleteMany({
      $or: [{ closed: true }, { archived: true }],
    });

    const remaining = await db.collection('markets').countDocuments();

    return NextResponse.json({
      cleaned: {
        byTimestamp: byTimestamp.deletedCount,
        byEndDate: byEndDate.deletedCount,
        byClosed: byClosed.deletedCount,
      },
      remaining,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
