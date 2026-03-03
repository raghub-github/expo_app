import { getSql } from "../client";

export interface OrderRiderReconRecord {
  id: number;
  orderId: number;
  merchantStoreId: number | null;
  providerName: string | null;
  trackingId: string | null;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  actorSystemUserId: number | null;
  actorEmail: string | null;
  reconReason: string;
  reconReasonCategory: string | null;
  reconAt: Date;
}

export interface CreateOrderRiderReconInput {
  orderId: number;
  merchantStoreId: number | null;
  providerName: string | null;
  trackingId: string | null;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  actorSystemUserId: number | null;
  actorEmail: string | null;
  reasonPreset?: string | null;
  reasonText?: string | null;
}

export async function listOrderRiderRecons(
  orderId: number
): Promise<OrderRiderReconRecord[]> {
  const sql = getSql();

  const rows = await sql`
    SELECT
      id,
      order_id              AS "orderId",
      merchant_store_id     AS "merchantStoreId",
      provider_name         AS "providerName",
      tracking_id           AS "trackingId",
      rider_id              AS "riderId",
      rider_name            AS "riderName",
      rider_mobile          AS "riderMobile",
      actor_system_user_id  AS "actorSystemUserId",
      actor_email           AS "actorEmail",
      recon_reason          AS "reconReason",
      recon_reason_category AS "reconReasonCategory",
      recon_at              AS "reconAt"
    FROM order_rider_recons
    WHERE order_id = ${orderId}
    ORDER BY recon_at DESC
  `;

  return (rows as unknown as Array<{ reconAt: Date }>).map((row) => ({
    ...row,
    reconAt: row.reconAt instanceof Date ? row.reconAt : new Date(row.reconAt),
  })) as OrderRiderReconRecord[];
}

/** Lightweight count for sidebar (no extra API call when included in order payload). */
export async function getOrderReconsCount(orderId: number): Promise<number> {
  const sql = getSql();
  const result = await sql`
    SELECT count(*)::int AS cnt FROM order_rider_recons WHERE order_id = ${orderId}
  `;
  const row = (result as unknown as Array<{ cnt: number }>)[0];
  return row?.cnt ?? 0;
}

function buildCombinedReason(
  preset?: string | null,
  text?: string | null
): { combined: string; category: string | null } {
  const p = (preset ?? "").trim();
  const t = (text ?? "").trim();

  let combined = "";
  if (p && t) {
    combined = `${p} !!!!!! ${t}`;
  } else if (p) {
    combined = p;
  } else {
    combined = t;
  }

  return {
    combined,
    category: p || null,
  };
}

export async function createOrderRiderRecon(
  input: CreateOrderRiderReconInput
): Promise<OrderRiderReconRecord> {
  const sql = getSql();

  // Enforce at most one recon per (order, rider) pair when riderId is known.
  if (input.riderId != null) {
    const existing = await sql`
      SELECT id
      FROM order_rider_recons
      WHERE order_id = ${input.orderId} AND rider_id = ${input.riderId}
      LIMIT 1
    `;
    const row = Array.isArray(existing) ? existing[0] : existing;
    if (row) {
      const err = new Error("RECON_ALREADY_EXISTS");
      throw err;
    }
  }

  const { combined, category } = buildCombinedReason(
    input.reasonPreset,
    input.reasonText
  );

  if (!combined) {
    throw new Error("RECON_REASON_REQUIRED");
  }

  const rows = await sql`
    INSERT INTO order_rider_recons (
      order_id,
      merchant_store_id,
      provider_name,
      tracking_id,
      rider_id,
      rider_name,
      rider_mobile,
      actor_system_user_id,
      actor_email,
      recon_reason,
      recon_reason_category
    )
    VALUES (
      ${input.orderId},
      ${input.merchantStoreId},
      ${input.providerName},
      ${input.trackingId},
      ${input.riderId},
      ${input.riderName},
      ${input.riderMobile},
      ${input.actorSystemUserId},
      ${input.actorEmail},
      ${combined},
      ${category}
    )
    RETURNING
      id,
      order_id              AS "orderId",
      merchant_store_id     AS "merchantStoreId",
      provider_name         AS "providerName",
      tracking_id           AS "trackingId",
      rider_id              AS "riderId",
      rider_name            AS "riderName",
      rider_mobile          AS "riderMobile",
      actor_system_user_id  AS "actorSystemUserId",
      actor_email           AS "actorEmail",
      recon_reason          AS "reconReason",
      recon_reason_category AS "reconReasonCategory",
      recon_at              AS "reconAt"
  `;

  const row = Array.isArray(rows) ? rows[0] : rows;

  return {
    ...(row as any),
    reconAt:
      (row as any).reconAt instanceof Date
        ? (row as any).reconAt
        : new Date((row as any).reconAt),
  } as OrderRiderReconRecord;
}

