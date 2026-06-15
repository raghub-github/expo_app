import type { Sql } from "postgres";
import { creditMerchantOrderEarningOnDelivered } from "./credit-merchant-order-on-delivered.js";

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Credit wallet for delivered orders missing ORDER_EARNING (e.g. delivered outside merchant PATCH).
 * Idempotent via settlement idempotency key settle:order:{coreId}.
 */
export async function backfillMissingDeliveredOrderCredits(
  sql: Sql,
  merchantStoreId: number,
  limit = 40
): Promise<{ credited: number; skipped: number }> {
  const rows = await sql<
    Array<{ id: number; order_id: number; order_status: string | null }>
  >`
    SELECT id, order_id, order_status
    FROM orders_food
    WHERE merchant_store_id = ${merchantStoreId}
      AND UPPER(COALESCE(order_status, '')) = 'DELIVERED'
    ORDER BY delivered_at DESC NULLS LAST, id DESC
    LIMIT ${limit}
  `;

  if (rows.length === 0) return { credited: 0, skipped: 0 };

  let credited = 0;
  let skipped = 0;

  for (const row of rows) {
    const ordersFoodId = Number(row.id);
    const ordersCoreId = Number(row.order_id);
    if (!Number.isFinite(ordersFoodId) || !Number.isFinite(ordersCoreId)) {
      skipped += 1;
      continue;
    }

    const existing = await sql`
      SELECT id
      FROM merchant_wallet_ledger
      WHERE reference_type = 'ORDER'
        AND reference_id = ${ordersFoodId}
        AND category = 'ORDER_EARNING'
      LIMIT 1
    `;
    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    let amount = 0;
    const foodRows = await sql<{ food_items_total_value: unknown }[]>`
      SELECT food_items_total_value FROM orders_food WHERE id = ${ordersFoodId} LIMIT 1
    `;
    amount = num(foodRows[0]?.food_items_total_value);

    if (amount <= 0) {
      skipped += 1;
      continue;
    }

    const result = await creditMerchantOrderEarningOnDelivered({
      merchantStoreId,
      ordersFoodId,
      ordersCoreId,
      amount,
      newStatus: "DELIVERED",
      previousStatus: "OUT_FOR_DELIVERY",
    });

    if (result.credited) credited += 1;
    else skipped += 1;
  }

  return { credited, skipped };
}
