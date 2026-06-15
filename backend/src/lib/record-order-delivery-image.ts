import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

type DbTx = PostgresJsDatabase<Record<string, unknown>>;

export type DeliveryProofImageInput = {
  orderCorePk: number;
  riderId: number;
  imageUrl: string;
  r2Key?: string | null;
  riderAssignmentId?: number | null;
  takenAt?: Date;
};

function firstRowId(rows: unknown): number | null {
  if (Array.isArray(rows)) {
    const id = Number((rows[0] as { id?: number | string } | undefined)?.id ?? 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  if (rows && typeof rows === "object" && "rows" in rows) {
    const list = (rows as { rows: Array<{ id?: number | string }> }).rows;
    const id = Number(list[0]?.id ?? 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  return null;
}

async function resolveAssignmentId(
  tx: DbTx,
  orderCorePk: number,
  riderId: number
): Promise<number | null> {
  const rows = await tx.execute(sql`
    SELECT id
    FROM order_rider_assignments
    WHERE order_core_id = ${orderCorePk}
      AND rider_id = ${riderId}
    ORDER BY is_active DESC, COALESCE(accepted_at, assigned_at, created_at) DESC
    LIMIT 1
  `);
  return firstRowId(rows);
}

/** Insert delivery proof — supports image_url or legacy url column. */
export async function recordOrderDeliveryProofImageTx(
  tx: DbTx,
  input: DeliveryProofImageInput
): Promise<void> {
  const imageUrl = String(input.imageUrl ?? "").trim();
  if (!imageUrl) return;

  const r2Key = String(input.r2Key ?? "").trim() || null;
  const takenAt = input.takenAt ?? new Date();
  const ts = takenAt.toISOString();

  const assignmentId =
    input.riderAssignmentId ?? (await resolveAssignmentId(tx, input.orderCorePk, input.riderId));

  try {
    await tx.execute(sql`
      INSERT INTO order_delivery_images (
        order_id,
        rider_assignment_id,
        image_type,
        image_url,
        r2_key,
        uploaded_by,
        uploaded_by_id,
        image_metadata,
        taken_at,
        created_at
      )
      VALUES (
        ${input.orderCorePk},
        ${assignmentId},
        'delivery',
        ${imageUrl},
        ${r2Key},
        'rider',
        ${input.riderId},
        '{}'::jsonb,
        ${ts}::timestamptz,
        ${ts}::timestamptz
      )
    `);
    return;
  } catch (modernErr) {
    try {
      await tx.execute(sql`
        INSERT INTO order_delivery_images (
          order_id,
          image_type,
          url,
          taken_at,
          created_at
        )
        VALUES (
          ${input.orderCorePk},
          'delivery',
          ${imageUrl},
          ${ts}::timestamptz,
          ${ts}::timestamptz
        )
      `);
      return;
    } catch (legacyErr) {
      const hint =
        modernErr instanceof Error ? modernErr.message : String(modernErr);
      const legacyHint =
        legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
      throw Object.assign(
        new Error(
          `Could not save delivery photo (${hint}; legacy: ${legacyHint}). Apply migration backend/drizzle/0283_order_delivery_images_r2.sql`
        ),
        { statusCode: 500, cause: legacyErr }
      );
    }
  }
}
