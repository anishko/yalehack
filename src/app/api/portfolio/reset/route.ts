import { NextResponse } from 'next/server';
import { resetBalance } from '@/lib/portfolio/manager';

export async function POST() {
  try {
    const result = await resetBalance();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
