/**
 * Persist customer packaging + rider uniform feedback after delivery.
 */

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client.js";

type Db = PostgresJsDatabase<Record<string, unknown>>;

export type CustomerPackagingFeedback = "good" | "not_good";

export type SaveCustomerPostDeliveryFeedbackInput = {
  orderCorePk: number;
  riderId?: number | null;
  packagingFeedback?: CustomerPackagingFeedback | null;
  riderInUniform?: boolean | null;
};

export async function saveCustomerPostDeliveryFeedback(
  input: SaveCustomerPostDeliveryFeedbackInput,
  db: Db = getDb()
): Promise<{
  packagingFeedback: CustomerPackagingFeedback | null;
  riderInUniform: boolean | null;
}> {
  const now = new Date().toISOString();
  let packagingFeedback: CustomerPackagingFeedback | null = null;
  let riderInUniform: boolean | null = null;

  if (input.packagingFeedback === "good" || input.packagingFeedback === "not_good") {
    await db.execute(sql`
      UPDATE orders_food
      SET
        customer_packaging_feedback = ${input.packagingFeedback},
        customer_packaging_reported_at = COALESCE(customer_packaging_reported_at, ${now}::timestamptz),
        updated_at = ${now}::timestamptz
      WHERE order_id = ${input.orderCorePk}
    `);
    packagingFeedback = input.packagingFeedback;
  }

  if (input.riderInUniform === true || input.riderInUniform === false) {
    const riderId = input.riderId != null ? Number(input.riderId) : null;
    if (riderId != null && Number.isFinite(riderId) && riderId > 0) {
      await db.execute(sql`
        UPDATE order_rider_assignments
        SET
          customer_rider_in_uniform = ${input.riderInUniform},
          customer_uniform_reported_at = COALESCE(customer_uniform_reported_at, ${now}::timestamptz),
          updated_at = ${now}::timestamptz
        WHERE order_core_id = ${input.orderCorePk}
          AND rider_id = ${riderId}
          AND id = (
            SELECT id
            FROM order_rider_assignments
            WHERE order_core_id = ${input.orderCorePk}
              AND rider_id = ${riderId}
            ORDER BY is_active DESC NULLS LAST,
                     assignment_sequence DESC NULLS LAST,
                     created_at DESC
            LIMIT 1
          )
      `);
      riderInUniform = input.riderInUniform;
    }
  }

  return { packagingFeedback, riderInUniform };
}

export async function loadCustomerPostDeliveryFeedback(
  orderCorePk: number,
  riderId?: number | null,
  db: Db = getDb()
): Promise<{
  packagingFeedback: CustomerPackagingFeedback | null;
  riderInUniform: boolean | null;
}> {
  const foodRows = (await db.execute(sql`
    SELECT customer_packaging_feedback
    FROM orders_food
    WHERE order_id = ${orderCorePk}
    LIMIT 1
  `)) as Array<{ customer_packaging_feedback?: string | null }>;

  const rawPackaging = foodRows[0]?.customer_packaging_feedback;
  const packagingFeedback =
    rawPackaging === "good" || rawPackaging === "not_good" ? rawPackaging : null;

  let riderInUniform: boolean | null = null;
  const resolvedRiderId = riderId != null ? Number(riderId) : null;
  if (resolvedRiderId != null && Number.isFinite(resolvedRiderId) && resolvedRiderId > 0) {
    const uniformRows = (await db.execute(sql`
      SELECT customer_rider_in_uniform
      FROM order_rider_assignments
      WHERE order_core_id = ${orderCorePk}
        AND rider_id = ${resolvedRiderId}
      ORDER BY is_active DESC NULLS LAST,
               assignment_sequence DESC NULLS LAST,
               created_at DESC
      LIMIT 1
    `)) as Array<{ customer_rider_in_uniform?: boolean | null }>;
    const val = uniformRows[0]?.customer_rider_in_uniform;
    riderInUniform = val === true || val === false ? val : null;
  }

  return { packagingFeedback, riderInUniform };
}
