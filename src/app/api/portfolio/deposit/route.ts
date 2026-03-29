import { NextRequest, NextResponse } from 'next/server';
import { deposit } from '@/lib/portfolio/manager';

export async function POST(req: NextRequest) {
  try {
    const { amount } = await req.json();
    const result = await deposit(Number(amount));
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
