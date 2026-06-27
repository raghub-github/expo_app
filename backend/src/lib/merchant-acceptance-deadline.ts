/**
 * Server-authoritative merchant acceptance deadline for food orders.
 */
import type { Sql } from "postgres";
import { loadMerchantOrderAcceptanceSettings } from "./merchant-order-acceptance-settings.js";

export type MerchantAcceptanceDeadline = {
  deadlineAt: string;
  windowSeconds: number;
};

export function acceptanceWindowSecondsFromMinutes(minutes: number | null | undefined): number {
  const mins = Number.isFinite(Number(minutes)) ? Number(minutes) : 5;
  return Math.max(60, Math.min(10_800, Math.floor(mins) * 60));
}

export function computeMerchantAcceptanceDeadline(
  createdAt: Date | string,
  windowSeconds: number
): string {
  const created = new Date(createdAt).getTime();
  const base = Number.isFinite(created) ? created : Date.now();
  return new Date(base + windowSeconds * 1000).toISOString();
}

/** Persist deadline on orders_food (idempotent — only fills when null). */
export async function ensureMerchantAcceptanceDeadlineForFoodOrder(
  sql: Sql,
  input: { ordersFoodId?: number; orderCorePk?: number; merchantStoreId: number }
): Promise<MerchantAcceptanceDeadline | null> {
  const storeId = input.merchantStoreId;
  if (!Number.isFinite(storeId) || storeId <= 0) return null;

  const settings = await loadMerchantOrderAcceptanceSettings(sql, storeId);
  const windowSeconds = acceptanceWindowSecondsFromMinutes(settings.acceptance_window_minutes);

  let row:
    | { id: number; created_at: Date | string; merchant_acceptance_deadline_at: string | null }
    | undefined;

  if (input.ordersFoodId != null && Number.isFinite(input.ordersFoodId)) {
    const rows = await sql`
      SELECT id, created_at, merchant_acceptance_deadline_at
      FROM orders_food
      WHERE id = ${input.ordersFoodId} AND merchant_store_id = ${storeId}
      LIMIT 1
    `;
    row = rows[0] as typeof row;
  } else if (input.orderCorePk != null && Number.isFinite(input.orderCorePk)) {
    const rows = await sql`
      SELECT id, created_at, merchant_acceptance_deadline_at
      FROM orders_food
      WHERE order_id = ${input.orderCorePk} AND merchant_store_id = ${storeId}
      ORDER BY id DESC
      LIMIT 1
    `;
    row = rows[0] as typeof row;
  }

  if (!row?.id) return null;
  if (row.merchant_acceptance_deadline_at) {
    const existing = new Date(row.merchant_acceptance_deadline_at).toISOString();
    return { deadlineAt: existing, windowSeconds };
  }

  const deadlineAt = computeMerchantAcceptanceDeadline(row.created_at, windowSeconds);
  await sql`
    UPDATE orders_food
    SET
      merchant_acceptance_window_seconds = ${windowSeconds},
      merchant_acceptance_deadline_at = ${deadlineAt}::timestamptz,
      updated_at = NOW()
    WHERE id = ${row.id}
      AND merchant_acceptance_deadline_at IS NULL
  `;
  return { deadlineAt, windowSeconds };
}
