import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WALLET_CONSTANTS } from '@/lib/wallet-types';
import { backfillMissingDeliveredOrderCredits, backfillMissingCancelledOrderLedger, repairErroneousZeroCompensationCancellationDebits } from '@/lib/backfill-merchant-wallet-credits';
import {
  applyWithdrawableBalanceToLedgerEntries,
  buildWithdrawableBalanceByLedgerId,
} from '@/lib/merchant-wallet-ledger-display';
import { enrichLedgerWithPgTransactionIds } from '@/lib/enrich-ledger-pg-transaction-id';
import { enrichMerchantLedgerDescriptions } from '@/lib/enrich-merchant-ledger-descriptions';
import { mergeCancellationLedgerEntries } from '@/lib/merge-cancellation-ledger-entries';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

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
 * Returns paginated V2 ledger entries (includes balance_before, gst, commission, tds, order_id, status).
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

    void (async () => {
      try {
        await backfillMissingDeliveredOrderCredits(db, merchantStoreId);
        await backfillMissingCancelledOrderLedger(db, merchantStoreId);
        await repairErroneousZeroCompensationCancellationDebits(merchantStoreId);
      } catch (backfillErr) {
        console.warn('[merchant/wallet/ledger] backfill:', backfillErr);
      }
    })();

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
        limit: WALLET_CONSTANTS.DEFAULT_LEDGER_PAGE_SIZE,
        offset: 0,
      });
    }

    const walletId = wallet.id as number;

    void (async () => {
      try {
        const { repairCancellationLedgerWithdrawableMetadata } = await import(
          '@/lib/backfill-merchant-wallet-credits'
        );
        await repairCancellationLedgerWithdrawableMetadata(db, walletId);
      } catch (repairErr) {
        console.warn('[merchant/wallet/ledger] repair withdrawable metadata:', repairErr);
      }
    })();
    const from = req.nextUrl.searchParams.get('from');
    const to = req.nextUrl.searchParams.get('to');
    const direction = req.nextUrl.searchParams.get('direction');
    const category = req.nextUrl.searchParams.get('category');
    const search = req.nextUrl.searchParams.get('search')?.trim();
    const limit = Math.min(WALLET_CONSTANTS.MAX_LEDGER_PAGE_SIZE, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? String(WALLET_CONSTANTS.DEFAULT_LEDGER_PAGE_SIZE), 10) || WALLET_CONSTANTS.DEFAULT_LEDGER_PAGE_SIZE));
    const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10) || 0);

    let query = db
      .from('merchant_wallet_ledger')
      .select(
        'id, direction, category, balance_type, amount, balance_before, balance_after, reference_type, reference_id, reference_extra, description, metadata, status, order_id, gst_amount, commission_amount, tds_amount, created_at',
        { count: 'exact' }
      )
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (from) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        query = query.gte('created_at', `${from}T00:00:00.000Z`);
      } else {
        const fromDate = new Date(from);
        if (!Number.isNaN(fromDate.getTime())) {
          query = query.gte('created_at', fromDate.toISOString());
        }
      }
    }
    if (to) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        const toEnd = new Date(to + 'T23:59:59.999Z');
        query = query.lte('created_at', toEnd.toISOString());
      } else {
        const toDate = new Date(to);
        if (!Number.isNaN(toDate.getTime())) {
          query = query.lte('created_at', toDate.toISOString());
        }
      }
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
      balance_before: row.balance_before != null ? Number(row.balance_before) : null,
      balance_after: Number(row.balance_after),
      reference_type: row.reference_type,
      reference_id: row.reference_id,
      reference_extra: row.reference_extra,
      description: row.description,
      metadata: row.metadata,
      status: row.status ?? 'COMPLETED',
      order_id: row.order_id ?? null,
      gst_amount: row.gst_amount != null ? Number(row.gst_amount) : null,
      commission_amount: row.commission_amount != null ? Number(row.commission_amount) : null,
      tds_amount: row.tds_amount != null ? Number(row.tds_amount) : null,
      created_at: row.created_at,
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
      let orderMeta: { id: number; order_id: string | null; formatted_order_id: string | null }[] = [];
      if (orderIds.length > 0) {
        const { data: coreRows } = await db
          .from('orders_core')
          .select('id, order_id, formatted_order_id')
          .in('id', orderIds);
        if (coreRows?.length) {
          orderMeta = coreRows as {
            id: number;
            order_id: string | null;
            formatted_order_id: string | null;
          }[];
        } else {
          const { data: ordRows } = await db
            .from('orders')
            .select('id, order_id, formatted_order_id')
            .in('id', orderIds);
          orderMeta = (ordRows || []) as {
            id: number;
            order_id: string | null;
            formatted_order_id: string | null;
          }[];
        }
      }
      const orderMetaMap = new Map(
        orderMeta.map((o) => [
          o.id,
          o.formatted_order_id?.trim() || o.order_id?.trim() || null,
        ])
      );
      orderRefs.forEach((e) => {
        const oid = foodMap.get(Number(e.reference_id!));
        if (oid != null) {
          e.order_id = oid;
          e.formatted_order_id = orderMetaMap.get(oid) ?? null;
          if (e.formatted_order_id && e.description) {
            e.description = e.description.replace(
              /Order #\d+/i,
              `Order ${e.formatted_order_id}`
            );
          }
        }
      });
    }

    const { data: bucketRows } = await db
      .from('merchant_wallet_ledger')
      .select('id, balance_type, balance_after, amount, direction, created_at, metadata')
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(5000);

    const withdrawableById = buildWithdrawableBalanceByLedgerId(
      (bucketRows ?? []).map((row) => ({
        id: row.id as number,
        balance_type: row.balance_type as string | null,
        balance_after: row.balance_after != null ? Number(row.balance_after) : null,
        amount: row.amount != null ? Number(row.amount) : null,
        direction: row.direction as string | null,
        created_at: row.created_at as string,
        metadata: row.metadata as Record<string, unknown> | null,
      }))
    );

    const enrichedList = applyWithdrawableBalanceToLedgerEntries(list, withdrawableById);
    const withPgIds = await enrichLedgerWithPgTransactionIds(db, enrichedList);
    const withDescriptions = await enrichMerchantLedgerDescriptions(db, withPgIds);
    const { entries: mergedEntries } = mergeCancellationLedgerEntries(withDescriptions);

    return NextResponse.json({
      success: true,
      entries: mergedEntries,
      total: count ?? list.length,
      limit,
      offset,
    });
  } catch (e) {
    console.error('[merchant/wallet/ledger]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
