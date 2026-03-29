import { NextResponse } from 'next/server';

const CATEGORIES = [
  'All', 'Crypto', 'Politics', 'Sports', 'Finance', 'Tech', 'Geopolitics', 'General',
];

export async function GET() {
  return NextResponse.json({ categories: CATEGORIES });
}
