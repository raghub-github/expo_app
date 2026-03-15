import { NextRequest, NextResponse } from 'next/server';
import { getDefaultCuisines } from '@/lib/cuisines';

// GET /api/cuisines
// Returns a list of default cuisines (strings).
export async function GET(_req: NextRequest) {
  try {
    const cuisines = await getDefaultCuisines();
    return NextResponse.json({ cuisines });
  } catch (e) {
    console.error('[cuisines GET]', e);
    return NextResponse.json({ cuisines: [] }, { status: 500 });
  }
}

