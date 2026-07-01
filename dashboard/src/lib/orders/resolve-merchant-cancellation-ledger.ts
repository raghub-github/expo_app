import { getSql } from "@/lib/db/client";
import { getMerchantCompensationEnginePayload } from "@/lib/db/operations/merchant-cancellation-compensation-engine";
import {
  compensationToMerchantDebit,
  resolveMerchantCancellationCompensation,
  type MerchantCompensationOrderContext,
} from "@/lib/merchant-cancellation-compensation";
import type { ResolvedMerchantCompensation } from "@/lib/merchant-cancellation-compensation-engine.types";
import { resolveMerchantWalletCreditAmount } from "@/lib/merchant-order-ctm";
import { supabaseAdmin } from "@/lib/supabase/server";

export type AutoMerchantCancellationDebit = {
  merchantDebit: string | null;
  partialAmount?: number | null;
  resolved: ResolvedMerchantCompensation | null;
  engineUsed: boolean;
};

async function loadOrderCompensationContext(
  orderCoreId: number
): Promise<MerchantCompensationOrderContext | null> {
  const sql = getSql();
  const rows = await sql.unsafe<
    {
      merchant_store_id: number | null;
      food_store_id: number | null;
      cancelled_by_type: string | null;
      created_at: string | null;
      cancelled_at: string | null;
      prepared_at: string | null;
      rider_picked_up_at: string | null;
      total_ctm: string | null;
      food_items_total_value: string | null;
      orders_food_id: number | null;
    }[]
  >(
    `
      SELECT
        c.merchant_store_id,
        f.merchant_store_id AS food_store_id,
        COALESCE(f.cancelled_by_type, c.cancelled_by_type) AS cancelled_by_type,
        c.created_at::text,
        COALESCE(f.cancelled_at, c.cancelled_at, f.updated_at, c.updated_at)::text AS cancelled_at,
        f.prepared_at::text,
        f.rider_picked_up_at::text,
        c.total_ctm::text,
        f.food_items_total_value::text,
        f.id AS orders_food_id
      FROM orders_core c
      LEFT JOIN orders_food f ON f.order_id = c.id
      WHERE c.id = $1
      LIMIT 1
    `,
    [orderCoreId]
  );
  const row = rows[0];
  const merchantStoreId = Number(row?.food_store_id ?? row?.merchant_store_id);
  const ordersFoodId = Number(row?.orders_food_id);
  if (!Number.isFinite(merchantStoreId) || merchantStoreId <= 0) return null;

  let netOrderValue = Number(row?.total_ctm ?? row?.food_items_total_value ?? 0);
  if (!(netOrderValue > 0) && supabaseAdmin && Number.isFinite(ordersFoodId) && ordersFoodId > 0) {
    try {
      netOrderValue = await resolveMerchantWalletCreditAmount(supabaseAdmin, {
        ordersCoreId: orderCoreId,
        ordersFoodId,
        storeId: merchantStoreId,
      });
    } catch {
      /* fallback to row values */
    }
  }

  return {
    orderCoreId,
    merchantStoreId,
    cancelledByType: String(row?.cancelled_by_type ?? ""),
    orderCreatedAt: row?.created_at ?? null,
    cancelledAt: row?.cancelled_at ?? null,
    preparedAt: row?.prepared_at ?? null,
    riderPickedUpAt: row?.rider_picked_up_at ?? null,
    netOrderValue: Math.max(0, Number.isFinite(netOrderValue) ? netOrderValue : 0),
  };
}

/** Resolve merchant debit from compensation engine when not explicitly overridden. */
export async function resolveAutoMerchantCancellationDebit(
  orderCoreId: number,
  explicitMerchantDebit?: string | null
): Promise<AutoMerchantCancellationDebit> {
  if (explicitMerchantDebit?.trim()) {
    return {
      merchantDebit: explicitMerchantDebit.trim(),
      resolved: null,
      engineUsed: false,
    };
  }

  try {
    const payload = await getMerchantCompensationEnginePayload();
    if (payload.migrationRequired || !payload.settings?.isEnabled) {
      return { merchantDebit: null, resolved: null, engineUsed: false };
    }

    const ctx = await loadOrderCompensationContext(orderCoreId);
    if (!ctx) return { merchantDebit: null, resolved: null, engineUsed: false };

    const sql = getSql();
    const resolved = await resolveMerchantCancellationCompensation(sql, ctx, payload);
    const debit = compensationToMerchantDebit(resolved);

    return {
      merchantDebit: debit.mode,
      partialAmount: debit.partialAmount ?? null,
      resolved,
      engineUsed: true,
    };
  } catch (e) {
    console.warn("[resolveAutoMerchantCancellationDebit]", e);
    return { merchantDebit: null, resolved: null, engineUsed: false };
  }
}
