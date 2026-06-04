import { supabaseAdmin } from "@/lib/supabase/server";
import { creditMerchantOrderEarningOnDelivered } from "@/lib/credit-merchant-order-on-delivered";
import {
  computeMerchantCtmForPartnerOrder,
  resolveMerchantWalletCreditAmount,
} from "@/lib/merchant-order-ctm";
import { getSql } from "@/lib/db/client";

/** Credit merchant wallet when order reaches delivered (dashboard agent / rider / status sync). */
export async function creditMerchantWalletForDeliveredCoreOrder(
  ordersCoreId: number,
  previousStatus?: string | null
): Promise<void> {
  if (!supabaseAdmin) return;

  const sql = getSql();
  const coreRows = await sql`
    SELECT id, merchant_store_id, current_status, order_id
    FROM orders_core
    WHERE id = ${ordersCoreId}
    LIMIT 1
  `;
  const core = (coreRows as unknown as Array<{
    id: number;
    merchant_store_id: number | null;
    current_status: string | null;
    order_id: string | null;
  }>)[0];
  if (!core?.merchant_store_id) return;

  const foodRows = await sql`
    SELECT id, order_status
    FROM orders_food
    WHERE order_id = ${ordersCoreId}
    LIMIT 1
  `;
  const food = (foodRows as unknown as Array<{ id: number; order_status: string | null }>)[0];
  if (!food?.id) return;

  const merchantStoreId = Number(core.merchant_store_id);
  const ordersFoodId = Number(food.id);
  const prev =
    String(previousStatus ?? food.order_status ?? core.current_status ?? "").trim() ||
    "OUT_FOR_DELIVERY";

  let amount = await resolveMerchantWalletCreditAmount(supabaseAdmin, {
    ordersCoreId,
    ordersFoodId,
    storeId: merchantStoreId,
  });

  if (amount <= 0) {
    const computed = await computeMerchantCtmForPartnerOrder(
      supabaseAdmin,
      ordersCoreId,
      merchantStoreId
    );
    if (computed != null && computed > 0) {
      const now = new Date().toISOString();
      await supabaseAdmin
        .from("orders_core")
        .update({ total_ctm: computed, updated_at: now })
        .eq("id", ordersCoreId);
      await supabaseAdmin
        .from("orders_food")
        .update({ food_items_total_value: computed, updated_at: now })
        .eq("id", ordersFoodId);
      amount = computed;
    }
  }

  if (amount <= 0) return;

  const result = await creditMerchantOrderEarningOnDelivered(supabaseAdmin, {
    merchantStoreId,
    ordersFoodId,
    ordersCoreId,
    amount,
    newStatus: "DELIVERED",
    previousStatus: prev.toUpperCase() === "DELIVERED" ? "OUT_FOR_DELIVERY" : prev,
  });

  if (!result.credited && result.error) {
    console.warn("[creditMerchantWalletForDeliveredCoreOrder]", ordersCoreId, result.error);
  }
}

/** @deprecated Use creditMerchantWalletForDeliveredCoreOrder */
export async function creditMerchantWalletAfterDashboardDelivery(
  ordersCoreId: number
): Promise<void> {
  await creditMerchantWalletForDeliveredCoreOrder(ordersCoreId);
}
