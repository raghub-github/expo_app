import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminApi } from '@/lib/super-admin-api';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getSql } from '@/lib/db/client';
import { logSuccessAction, getIpAddress, getUserAgent } from '@/lib/audit/logger';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  normalizeStoreSearchToken,
  resolveStorePublicIdInput,
} from '@/lib/merchants/normalize-store-search';

export const runtime = 'nodejs';

const patchSchema = z.object({
  menuItemPk: z.number().int().positive(),
  lock: z.boolean(),
  reason: z.string().max(500).optional(),
});

const postSchema = z.object({
  action: z.literal('unlock_all'),
  storePublicId: z.string().min(1).max(64),
  reason: z.string().max(500).optional(),
});

const ADMIN_UNLOCK_REASON_DEFAULT = 'Unlocked By Gatimitra Team';

function formatLockReason(reason: string | null, lockedBy: string | null): string {
  if (!reason) return lockedBy === 'admin' ? 'Manual Lock' : 'Other';
  switch (reason) {
    case 'plan_item_limit_exceeded':
      return 'Subscription Limit';
    case 'manual_admin_lock':
      return 'Manual Lock';
    case 'manual_admin_unlock':
      return 'Unlocked By Gatimitra Team';
    case ADMIN_UNLOCK_REASON_DEFAULT:
      return ADMIN_UNLOCK_REASON_DEFAULT;
    default:
      return reason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function hasDetailFilters(sp: URLSearchParams): boolean {
  return Boolean(
    (sp.get('store') ?? '').trim() ||
      (sp.get('merchant') ?? '').trim() ||
      (sp.get('itemName') ?? '').trim() ||
      (sp.get('itemId') ?? '').trim()
  );
}

async function fetchStoreSummary() {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      ms.id AS store_numeric_id,
      ms.store_id AS store_public_id,
      ms.store_name,
      mp.parent_name AS merchant_name,
      mp.parent_merchant_id AS merchant_id,
      COUNT(*)::int AS locked_items
    FROM merchant_menu_items mi
    INNER JOIN merchant_stores ms ON ms.id = mi.store_id
    LEFT JOIN merchant_parents mp ON mp.id = ms.parent_id
    WHERE COALESCE(mi.is_deleted, FALSE) = FALSE
      AND mi.is_locked_by_plan = TRUE
    GROUP BY ms.id, ms.store_id, ms.store_name, mp.parent_name, mp.parent_merchant_id
    ORDER BY locked_items DESC, ms.store_name ASC
  `) as Array<{
    store_numeric_id: number;
    store_public_id: string;
    store_name: string | null;
    merchant_name: string | null;
    merchant_id: string | null;
    locked_items: number;
  }>;

  return rows.map((r) => ({
    storeNumericId: r.store_numeric_id,
    storePublicId: r.store_public_id,
    storeName: r.store_name,
    merchantName: r.merchant_name,
    merchantId: r.merchant_id,
    lockedItems: r.locked_items,
  }));
}

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const view = sp.get('view');
  const detailRequested = view === 'detail' || hasDetailFilters(sp);

  if (!detailRequested) {
    try {
      const stores = await fetchStoreSummary();
      const totalLocked = stores.reduce((sum, s) => sum + s.lockedItems, 0);
      return NextResponse.json({
        ok: true,
        mode: 'summary',
        stores,
        totalStores: stores.length,
        totalLocked,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load store summary';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const storeQuery = (sp.get('store') ?? '').trim();
  const merchantQuery = (sp.get('merchant') ?? '').trim();
  const itemName = (sp.get('itemName') ?? '').trim();
  const itemId = (sp.get('itemId') ?? '').trim();
  const lockedOnly = sp.get('lockedOnly') !== '0';
  const limit = Math.min(Math.max(Number(sp.get('limit') ?? 50), 1), 500);
  const offset = Math.max(Number(sp.get('offset') ?? 0), 0);

  try {
    let storeNumericIds: number[] | null = null;
    let resolvedStorePublicId: string | null = null;

    if (storeQuery || merchantQuery) {
      let storeQ = supabaseAdmin
        .from('merchant_stores')
        .select('id, store_id, store_name, parent_id, merchant_parents(parent_name, parent_merchant_id, brand_name)');

      if (storeQuery) {
        const { exactPublicId, partialToken } = normalizeStoreSearchToken(storeQuery);
        if (exactPublicId) {
          storeQ = storeQ.eq('store_id', exactPublicId);
        } else {
          storeQ = storeQ.or(`store_id.ilike.%${partialToken}%,store_name.ilike.%${partialToken}%`);
        }
      }

      const { data: stores, error: storeErr } = await storeQ.limit(200);
      if (storeErr) {
        return NextResponse.json({ error: storeErr.message }, { status: 500 });
      }

      let filteredStores = stores ?? [];
      if (merchantQuery) {
        const mq = merchantQuery.toLowerCase();
        filteredStores = filteredStores.filter((s) => {
          const parent = s.merchant_parents as {
            parent_name?: string;
            parent_merchant_id?: string;
            brand_name?: string;
          } | null;
          const merchantLabel = parent?.parent_name ?? parent?.brand_name ?? '';
          return (
            merchantLabel.toLowerCase().includes(mq) ||
            (parent?.parent_merchant_id ?? '').toLowerCase().includes(mq)
          );
        });
      }

      storeNumericIds = filteredStores.map((s) => s.id as number);
      if (storeQuery && filteredStores.length > 0) {
        resolvedStorePublicId =
          normalizeStoreSearchToken(storeQuery).exactPublicId ??
          (filteredStores[0]?.store_id as string | undefined) ??
          null;
      }
      if (storeNumericIds.length === 0) {
        return NextResponse.json({
          ok: true,
          mode: 'detail',
          items: [],
          total: 0,
          limit,
          offset,
        });
      }
    }

    let itemQ = supabaseAdmin
      .from('merchant_menu_items')
      .select(
        'id, store_id, item_id, item_name, is_locked_by_plan, locked_reason, locked_by, locked_at, unlocked_by, unlocked_at, admin_lock_override, created_at, merchant_stores(store_id, store_name, parent_id, merchant_parents(parent_name, parent_merchant_id, brand_name))',
        { count: 'exact' }
      )
      .eq('is_deleted', false)
      .order('locked_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (lockedOnly) {
      itemQ = itemQ.eq('is_locked_by_plan', true);
    }
    if (storeNumericIds) {
      itemQ = itemQ.in('store_id', storeNumericIds);
    }
    if (itemName) {
      itemQ = itemQ.ilike('item_name', `%${itemName}%`);
    }
    if (itemId) {
      itemQ = itemQ.or(`item_id.ilike.%${itemId}%,id.eq.${/^\d+$/.test(itemId) ? itemId : -1}`);
    }

    const { data: rows, error, count } = await itemQ;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (rows ?? []).map((row) => {
      const store = row.merchant_stores as {
        store_id?: string;
        store_name?: string;
        merchant_parents?: {
          parent_name?: string;
          parent_merchant_id?: string;
          brand_name?: string;
        };
      } | null;
      const parent = store?.merchant_parents;
      return {
        menuItemPk: row.id,
        itemId: row.item_id,
        itemName: row.item_name,
        isLocked: row.is_locked_by_plan === true,
        lockReason: formatLockReason(row.locked_reason, row.locked_by),
        lockReasonRaw: row.locked_reason,
        lockedBy: row.locked_by ?? (row.is_locked_by_plan ? 'system' : null),
        lockedAt: row.locked_at,
        unlockedBy: row.unlocked_by,
        unlockedAt: row.unlocked_at,
        adminOverride: row.admin_lock_override === true,
        storePublicId: store?.store_id ?? null,
        storeName: store?.store_name ?? null,
        merchantName: parent?.parent_name ?? parent?.brand_name ?? null,
        merchantId: parent?.parent_merchant_id ?? null,
        createdAt: row.created_at,
      };
    });

    if (!resolvedStorePublicId && storeQuery && items.length > 0) {
      resolvedStorePublicId =
        normalizeStoreSearchToken(storeQuery).exactPublicId ?? items[0]?.storePublicId ?? null;
    }

    return NextResponse.json({
      ok: true,
      mode: 'detail',
      items,
      total: count ?? items.length,
      limit,
      offset,
      resolvedStorePublicId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load locked items';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let input: z.infer<typeof postSchema>;
  try {
    input = postSchema.parse(body);
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues.map((x) => x.message).join(', ') : 'Invalid body';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminIdentifier = user?.email ?? user?.id ?? 'super-admin';
  const reason = input.reason ?? ADMIN_UNLOCK_REASON_DEFAULT;

  try {
    const storePublicId = resolveStorePublicIdInput(input.storePublicId);
    const { data: storeRow, error: storeErr } = await supabaseAdmin
      .from('merchant_stores')
      .select('id, store_id, store_name')
      .eq('store_id', storePublicId)
      .maybeSingle();

    if (storeErr) {
      return NextResponse.json({ error: storeErr.message }, { status: 500 });
    }
    if (!storeRow?.id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { data: lockedRows, error: listErr } = await supabaseAdmin
      .from('merchant_menu_items')
      .select('id')
      .eq('store_id', storeRow.id)
      .eq('is_deleted', false)
      .eq('is_locked_by_plan', true);

    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 });
    }

    const ids = (lockedRows ?? []).map((r) => r.id as number);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, unlocked: 0, message: 'No locked items for this store' });
    }

    let unlocked = 0;
    const failures: string[] = [];

    for (const menuItemPk of ids) {
      const { data, error } = await supabaseAdmin.rpc('admin_set_menu_item_lock', {
        p_menu_item_pk: menuItemPk,
        p_lock: false,
        p_admin_identifier: adminIdentifier,
        p_reason: reason,
      });
      if (error) {
        failures.push(`#${menuItemPk}: ${error.message}`);
        continue;
      }
      const result = data as { error?: string };
      if (result?.error) {
        failures.push(`#${menuItemPk}: ${result.error}`);
        continue;
      }
      unlocked += 1;
    }

    if (user?.id && user.email) {
      await logSuccessAction(user.id, user.email, 'SYSTEM', 'UNBLOCK', {
        resourceType: 'merchant_store',
        resourceId: storeRow.store_id,
        actionDetails: {
          action: 'unlock_all',
          unlocked,
          total: ids.length,
          reason,
        },
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
        requestPath: req.nextUrl.pathname,
        requestMethod: 'POST',
      });
    }

    return NextResponse.json({
      ok: true,
      unlocked,
      total: ids.length,
      failures: failures.length > 0 ? failures : undefined,
      storePublicId: storeRow.store_id,
      storeName: storeRow.store_name,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bulk unlock failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let input: z.infer<typeof patchSchema>;
  try {
    input = patchSchema.parse(body);
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues.map((x) => x.message).join(', ') : 'Invalid body';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminIdentifier = user?.email ?? user?.id ?? 'super-admin';

  try {
    const { data, error } = await supabaseAdmin.rpc('admin_set_menu_item_lock', {
      p_menu_item_pk: input.menuItemPk,
      p_lock: input.lock,
      p_admin_identifier: adminIdentifier,
      p_reason: input.reason ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = data as { error?: string; success?: boolean };
    if (result?.error) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    if (user?.id && user.email) {
      await logSuccessAction(user.id, user.email, 'SYSTEM', input.lock ? 'BLOCK' : 'UNBLOCK', {
        resourceType: 'merchant_menu_item',
        resourceId: String(input.menuItemPk),
        actionDetails: {
          lock: input.lock,
          reason: input.reason ?? null,
        },
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
        requestPath: req.nextUrl.pathname,
        requestMethod: 'PATCH',
      });
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lock update failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
