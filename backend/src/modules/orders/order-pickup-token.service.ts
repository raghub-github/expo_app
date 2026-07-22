/**
 * Pickup-token validation — the security core of the KOT / rider-scan handoff.
 *
 * The KOT prints a QR encoding a cryptographically-random pickup token (see
 * migration 0438, table order_pickup_tokens — one immutable, backend-generated
 * token per order). When a rider scans it, THIS service is the single place that
 * decides whether the pickup is allowed. NEVER trust client-side validation.
 *
 * Every attempt (success or rejection) is written to order_pickup_scan_audit.
 * The whole check + consume runs in ONE transaction with `FOR UPDATE` on the token
 * row, so concurrent scans of the same token cannot both succeed (one-time use,
 * race-condition free).
 */

import { getSql } from "../../db/client.js";

export type PickupScanInput = {
  /** Raw token string decoded from the scanned QR. */
  token: string;
  /** Authenticated rider id (from the rider JWT — never from the request body). */
  riderId: number;
  /** Free-form device fingerprint for the audit trail. */
  device?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type PickupScanRejectReason =
  | "ORDER_NOT_FOUND"
  | "TOKEN_NOT_FOUND"
  | "TOKEN_TAMPERED"
  | "TOKEN_NOT_ACTIVE"
  | "TOKEN_ALREADY_USED"
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALIDATED"
  | "WRONG_RIDER"
  | "ORDER_STATE_NOT_PICKABLE"
  | "OTP_INVALID"
  | "OTP_MISMATCH"
  | "OTP_UNAVAILABLE";

export type PickupScanResult =
  | {
      ok: true;
      orderId: number;
      /** Public order id (GM…) for the caller to echo / notify with. */
      publicOrderId: string | null;
      riderId: number;
      pickedUpAt: string;
    }
  | { ok: false; status: number; reason: PickupScanRejectReason; message: string };

const REJECT_MESSAGE: Record<PickupScanRejectReason, string> = {
  ORDER_NOT_FOUND: "Order not found.",
  TOKEN_NOT_FOUND: "Invalid pickup code.",
  TOKEN_TAMPERED: "Invalid pickup code.",
  TOKEN_NOT_ACTIVE: "This pickup code is not active.",
  TOKEN_ALREADY_USED: "This order has already been picked up.",
  TOKEN_EXPIRED: "This pickup code has expired.",
  TOKEN_INVALIDATED: "This pickup code is no longer valid.",
  WRONG_RIDER: "Invalid pickup. This order is assigned to another delivery partner.",
  ORDER_STATE_NOT_PICKABLE: "This order cannot be picked up in its current state.",
  OTP_INVALID: "Enter a valid pickup OTP.",
  OTP_MISMATCH: "Incorrect pickup OTP.",
  OTP_UNAVAILABLE: "No pickup OTP is set for this order.",
};

/** Basic shape guard before touching the DB (cheap tamper rejection). */
function looksLikeToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(token);
}

async function audit(
  // Base Sql or a TransactionSql handle — postgres.js's generics don't unify, so
  // this internal helper takes the tagged-template callable loosely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any,
  row: {
    orderId: number | null;
    tokenId: number | null;
    token: string | null;
    riderId: number;
    outcome: "SUCCESS" | "REJECTED";
    reason: string | null;
    device?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }
): Promise<void> {
  try {
    await sql`
      INSERT INTO order_pickup_scan_audit
        (order_id, token_id, token, rider_id, outcome, reason, device, latitude, longitude)
      VALUES (${row.orderId}, ${row.tokenId}, ${row.token}, ${row.riderId}, ${row.outcome},
              ${row.reason}, ${row.device ?? null}, ${row.latitude ?? null}, ${row.longitude ?? null})
    `;
  } catch {
    /* auditing must never break the scan response */
  }
}

/**
 * Validate a scanned pickup token and, only if EVERY check passes, atomically
 * consume it (status → USED) and stamp the pickup on the order. Returns a typed
 * result; the caller maps it to an HTTP response and fires realtime notifications.
 */
export async function validatePickupScan(input: PickupScanInput): Promise<PickupScanResult> {
  const sql = getSql();
  const device = input.device ?? null;

  // Cheap tamper check before any DB work.
  if (!looksLikeToken(input.token)) {
    await audit(sql, {
      orderId: null, tokenId: null, token: String(input.token ?? "").slice(0, 64),
      riderId: input.riderId, outcome: "REJECTED", reason: "TOKEN_TAMPERED",
      device, latitude: input.latitude, longitude: input.longitude,
    });
    return { ok: false, status: 400, reason: "TOKEN_TAMPERED", message: REJECT_MESSAGE.TOKEN_TAMPERED };
  }

  return sql.begin(async (tx) => {
    // Lock the token row so two concurrent scans can't both consume it.
    const rows = await tx`
      SELECT t.id, t.order_id, t.status, t.assigned_rider_id, t.expires_at,
             oc.order_id AS public_order_id, oc.order_type
      FROM order_pickup_tokens t
      JOIN orders_core oc ON oc.id = t.order_id
      WHERE t.token = ${input.token}
      FOR UPDATE OF t
      LIMIT 1
    `;
    const row = rows[0] as
      | {
          id: number; order_id: number; status: string;
          assigned_rider_id: number | null; expires_at: string | null;
          public_order_id: string | null; order_type: string | null;
        }
      | undefined;

    const reject = async (
      reason: PickupScanRejectReason,
      status: number
    ): Promise<PickupScanResult> => {
      await audit(tx, {
        orderId: row?.order_id ?? null, tokenId: row?.id ?? null, token: input.token,
        riderId: input.riderId, outcome: "REJECTED", reason,
        device, latitude: input.latitude, longitude: input.longitude,
      });
      return { ok: false, status, reason, message: REJECT_MESSAGE[reason] };
    };

    if (!row) return reject("TOKEN_NOT_FOUND", 404);
    if (row.status === "USED") return reject("TOKEN_ALREADY_USED", 409);
    if (row.status === "INVALIDATED") return reject("TOKEN_INVALIDATED", 409);
    if (row.status === "EXPIRED") return reject("TOKEN_EXPIRED", 410);
    if (row.status !== "ACTIVE") return reject("TOKEN_NOT_ACTIVE", 409);
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      await tx`UPDATE order_pickup_tokens SET status='EXPIRED', updated_at=now() WHERE id=${row.id}`;
      return reject("TOKEN_EXPIRED", 410);
    }
    // Only the CURRENTLY assigned rider may pick up.
    if (row.assigned_rider_id == null || Number(row.assigned_rider_id) !== Number(input.riderId)) {
      return reject("WRONG_RIDER", 403);
    }

    return consumePickup(
      tx,
      { id: row.id, order_id: row.order_id, public_order_id: row.public_order_id, token: input.token },
      input.riderId,
      device,
      input.latitude,
      input.longitude
    );
  });
}

/**
 * Shared success path for BOTH the QR-token and the OTP flow: consume the token
 * one-time (guarded on status so a racing tx can't double-pick), stamp the pickup
 * on the order, and audit SUCCESS. Consuming the token here also invalidates the
 * OTP — both are tied to the same order and neither works again after pickup.
 */
async function consumePickup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  row: { id: number; order_id: number; public_order_id: string | null; token: string },
  riderId: number,
  device: string | null,
  latitude: number | null | undefined,
  longitude: number | null | undefined
): Promise<PickupScanResult> {
  const pickedUpAt = new Date().toISOString();
  const consumed = await tx`
    UPDATE order_pickup_tokens
    SET status='USED', used_at=${pickedUpAt}, scanned_at=${pickedUpAt},
        scanned_by_rider_id=${riderId}, scanned_device=${device}, updated_at=now()
    WHERE id=${row.id} AND status='ACTIVE'
    RETURNING id
  `;
  if (consumed.length === 0) {
    await audit(tx, {
      orderId: row.order_id, tokenId: row.id, token: row.token, riderId,
      outcome: "REJECTED", reason: "TOKEN_ALREADY_USED", device, latitude, longitude,
    });
    return { ok: false, status: 409, reason: "TOKEN_ALREADY_USED", message: REJECT_MESSAGE.TOKEN_ALREADY_USED };
  }
  await tx`
    UPDATE orders_core
    SET status = 'picked_up',
        current_status = 'OUT_FOR_DELIVERY',
        actual_pickup_time = COALESCE(actual_pickup_time, ${pickedUpAt}),
        updated_at = now()
    WHERE id = ${row.order_id}
  `;
  await tx`
    UPDATE orders_food
    SET rider_picked_up_at = COALESCE(rider_picked_up_at, ${pickedUpAt}),
        handed_over_to_rider_at = COALESCE(handed_over_to_rider_at, ${pickedUpAt}),
        order_status = CASE
          WHEN order_status IS NULL OR order_status = '' THEN 'OUT_FOR_DELIVERY'
          ELSE order_status
        END,
        dispatched_at = COALESCE(dispatched_at, ${pickedUpAt}),
        updated_at = now()
    WHERE order_id = ${row.order_id}
       OR core_order_id = ${row.public_order_id}
  `;
  await audit(tx, {
    orderId: row.order_id, tokenId: row.id, token: row.token, riderId,
    outcome: "SUCCESS", reason: null, device, latitude, longitude,
  });
  return { ok: true, orderId: row.order_id, publicOrderId: row.public_order_id, riderId, pickedUpAt };
}

export type PickupOtpInput = {
  /** orders_core.id of the order the rider is picking up. */
  orderId: number;
  otp: string;
  riderId: number;
  device?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/**
 * Validate a pickup OTP entered by the rider. Same backend-only guarantees as the
 * QR flow (order/token/rider/state checks, race-free consume, audit). Either method
 * completing the pickup invalidates BOTH (shared token → USED).
 */
export async function validatePickupByOtp(input: PickupOtpInput): Promise<PickupScanResult> {
  const sql = getSql();
  const device = input.device ?? null;
  const otp = String(input.otp ?? "").trim();
  if (!/^\d{3,8}$/.test(otp)) {
    await audit(sql, {
      orderId: input.orderId, tokenId: null, token: null, riderId: input.riderId,
      outcome: "REJECTED", reason: "OTP_INVALID", device,
      latitude: input.latitude, longitude: input.longitude,
    });
    return { ok: false, status: 400, reason: "OTP_INVALID", message: REJECT_MESSAGE.OTP_INVALID };
  }

  return sql.begin(async (tx) => {
    const rows = await tx`
      SELECT t.id, t.order_id, t.status, t.assigned_rider_id, t.expires_at, t.token,
             oc.order_id AS public_order_id,
             COALESCE(NULLIF(TRIM(of.pickup_otp), ''), NULLIF(TRIM(oc.pickup_otp), '')) AS pickup_otp
      FROM order_pickup_tokens t
      JOIN orders_core oc ON oc.id = t.order_id
      LEFT JOIN orders_food of ON of.order_id = oc.id
      WHERE t.order_id = ${input.orderId}
      FOR UPDATE OF t
      LIMIT 1
    `;
    const row = rows[0] as
      | {
          id: number; order_id: number; status: string; assigned_rider_id: number | null;
          expires_at: string | null; token: string; public_order_id: string | null;
          pickup_otp: string | null;
        }
      | undefined;

    const reject = async (
      reason: PickupScanRejectReason,
      status: number
    ): Promise<PickupScanResult> => {
      await audit(tx, {
        orderId: row?.order_id ?? input.orderId, tokenId: row?.id ?? null,
        token: row?.token ?? null, riderId: input.riderId, outcome: "REJECTED", reason,
        device, latitude: input.latitude, longitude: input.longitude,
      });
      return { ok: false, status, reason, message: REJECT_MESSAGE[reason] };
    };

    if (!row) return reject("ORDER_NOT_FOUND", 404);
    if (row.status === "USED") return reject("TOKEN_ALREADY_USED", 409);
    if (row.status === "INVALIDATED") return reject("TOKEN_INVALIDATED", 409);
    if (row.status === "EXPIRED") return reject("TOKEN_EXPIRED", 410);
    if (row.status !== "ACTIVE") return reject("TOKEN_NOT_ACTIVE", 409);
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      await tx`UPDATE order_pickup_tokens SET status='EXPIRED', updated_at=now() WHERE id=${row.id}`;
      return reject("TOKEN_EXPIRED", 410);
    }
    if (row.assigned_rider_id == null || Number(row.assigned_rider_id) !== Number(input.riderId)) {
      return reject("WRONG_RIDER", 403);
    }
    if (!row.pickup_otp || String(row.pickup_otp).trim() === "") return reject("OTP_UNAVAILABLE", 409);
    if (String(row.pickup_otp).trim() !== otp) return reject("OTP_MISMATCH", 401);

    return consumePickup(
      tx,
      { id: row.id, order_id: row.order_id, public_order_id: row.public_order_id, token: row.token },
      input.riderId,
      device,
      input.latitude,
      input.longitude
    );
  });
}
