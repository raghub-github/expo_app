import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreInternalId(db: ReturnType<typeof getDb>, storeId: string): Promise<number | null> {
  const { data, error } = await db
    .from('merchant_stores')
    .select('id')
    .eq('store_id', storeId)
    .single();
  if (error || !data) return null;
  return data.id as number;
}

/**
 * GET /api/merchant/wallet/ledger?storeId=GMMC1015&from=&to=&direction=&category=&search=&limit=50&offset=0
 * Returns paginated ledger entries with strong filters.
 */
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get('storeId') ?? req.nextUrl.searchParams.get('store_id');
    if (!storeId?.trim()) {
      return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const db = getDb();
    const merchantStoreId = await resolveStoreInternalId(db, storeId.trim());
    if (merchantStoreId === null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { data: wallet } = await db
      .from('merchant_wallet')
      .select('id')
      .eq('merchant_store_id', merchantStoreId)
      .single();

    if (!wallet) {
      return NextResponse.json({
        success: true,
        entries: [],
        total: 0,
        limit: 50,
        offset: 0,
      });
    }

    const walletId = wallet.id as number;
    const from = req.nextUrl.searchParams.get('from'); // YYYY-MM-DD
    const to = req.nextUrl.searchParams.get('to');
    const direction = req.nextUrl.searchParams.get('direction'); // CREDIT | DEBIT
    const category = req.nextUrl.searchParams.get('category');
    const search = req.nextUrl.searchParams.get('search')?.trim();
    const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10) || 50));
    const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10) || 0);

    let query = db
      .from('merchant_wallet_ledger')
      .select('id, direction, category, balance_type, amount, balance_after, reference_type, reference_id, reference_extra, description, metadata, created_at', { count: 'exact' })
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      query = query.gte('created_at', `${from}T00:00:00.000Z`);
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      const toEnd = new Date(to + 'T23:59:59.999Z');
      query = query.lte('created_at', toEnd.toISOString());
    }
    if (direction === 'CREDIT' || direction === 'DEBIT') {
      query = query.eq('direction', direction);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (search) {
      const safe = String(search).replace(/'/g, "''").slice(0, 200);
      query = query.or(`description.ilike.%${safe}%,reference_extra.ilike.%${safe}%`);
    }

    const { data: entries, error, count } = await query;

    if (error) {
      console.error('[merchant/wallet/ledger]', error);
      return NextResponse.json({ error: 'Failed to load ledger' }, { status: 500 });
    }

    const list = (entries || []).map((row) => ({
      id: row.id,
      direction: row.direction,
      category: row.category,
      balance_type: row.balance_type,
      amount: Number(row.amount),
      balance_after: Number(row.balance_after),
      reference_type: row.reference_type,
      reference_id: row.reference_id,
      reference_extra: row.reference_extra,
      description: row.description,
      metadata: row.metadata,
      created_at: row.created_at,
      order_id: null as number | null,
      formatted_order_id: null as string | null,
      table_id: null as string | null,
    }));

    const orderRefs = list.filter((e) => e.reference_type === 'ORDER' && e.reference_id != null);
    if (orderRefs.length > 0) {
      const foodIds = [...new Set(orderRefs.map((e) => Number(e.reference_id!)))];
      const { data: foodRows } = await db
        .from('orders_food')
        .select('id, order_id')
        .in('id', foodIds);
      const foodMap = new Map((foodRows || []).map((f: { id: number; order_id: number }) => [f.id, f.order_id]));
      const orderIds = [...new Set((foodRows || []).map((f: { order_id: number }) => f.order_id))];
      let orderMeta: { id: number; formatted_order_id: string | null }[] = [];
      if (orderIds.length > 0) {
        const { data: coreRows } = await db.from('orders_core').select('id, formatted_order_id').in('id', orderIds);
        if (coreRows?.length) {
          orderMeta = coreRows as { id: number; formatted_order_id: string | null }[];
        } else {
          const { data: ordRows } = await db.from('orders').select('id, formatted_order_id').in('id', orderIds);
          orderMeta = (ordRows || []) as { id: number; formatted_order_id: string | null }[];
        }
      }
      const orderMetaMap = new Map(orderMeta.map((o) => [o.id, o.formatted_order_id]));
      orderRefs.forEach((e) => {
        const oid = foodMap.get(Number(e.reference_id!));
        if (oid != null) {
          e.order_id = oid;
          e.formatted_order_id = orderMetaMap.get(oid) ?? null;
        }
      });
    }

    return NextResponse.json({
      success: true,
      entries: list,
      total: count ?? list.length,
      limit,
      offset,
    });
  } catch (e) {
    console.error('[merchant/wallet/ledger]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
