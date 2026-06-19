import { NextRequest, NextResponse } from 'next/server';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { client as sql } from '@/lib/drizzle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/merchant/store-record?storeId=GMMC1015 — direct Postgres (avoids PostgREST PGRST002). */
export async function GET(req: NextRequest) {
  try {
    const storeId =
      req.nextUrl.searchParams.get('storeId') ??
      req.nextUrl.searchParams.get('store_id');
    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const trimmed = storeId.trim();
    const gate = await assertStoreAccess(trimmed);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    let rows = await sql`
      SELECT *
      FROM merchant_stores
      WHERE store_id = ${trimmed}
      LIMIT 1
    `;

    if (!rows[0] && /^\d+$/.test(trimmed)) {
      rows = await sql`
        SELECT *
        FROM merchant_stores
        WHERE id = ${parseInt(trimmed, 10)}
        LIMIT 1
      `;
    }

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (e) {
    console.error('[store-record]', e);
    return NextResponse.json({ error: 'Store lookup failed' }, { status: 500 });
  }
}
