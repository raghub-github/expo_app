/**
 * Pickup-token validation — KOT / rider-scan handoff.
 *
 * The KOT prints a cryptographically-random pickup token (order_pickup_tokens.token).
 * The token string is IMMUTABLE for the life of the order. Validation authorizes the
 * *currently assigned* rider (orders_core.rider_id), not a one-time burn.
 *
 * After a successful pickup we record scan metadata but keep status ACTIVE so a
 * reassigned rider can scan the same printed QR. Unassign clears pickup stamps and
 * reactivates via gm_reactivate_order_pickup_token.
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
  | "ALREADY_PICKED_UP"
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
  ALREADY_PICKED_UP: "You have already picked up this order.",
  OTP_INVALID: "Enter a valid pickup OTP.",
  OTP_MISMATCH: "Incorrect pickup OTP.",
  OTP_UNAVAILABLE: "No pickup OTP is set for this order.",
};

/** Basic shape guard before touching the DB (cheap tamper rejection). */
function looksLikeToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(token);
}

async function audit(
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

type TokenRow = {
  id: number;
  order_id: number;
  status: string;
  assigned_rider_id: number | null;
  expires_at: string | null;
  public_order_id: string | null;
  order_type: string | null;
  current_rider_id: number | null;
  core_status: string | null;
  current_status: string | null;
  active_assignment_picked_up_at: string | null;
};

async function rejectScan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  input: { token: string | null; riderId: number; device: string | null; latitude?: number | null; longitude?: number | null },
  row: Partial<TokenRow> | null | undefined,
  reason: PickupScanRejectReason,
  status: number
): Promise<PickupScanResult> {
  await audit(tx, {
    orderId: row?.order_id ?? null,
    tokenId: row?.id ?? null,
    token: input.token,
    riderId: input.riderId,
    outcome: "REJECTED",
    reason,
    device: input.device,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  return { ok: false, status, reason, message: REJECT_MESSAGE[reason] };
}

function isTerminalOrderStatus(coreStatus: string | null, currentStatus: string | null): boolean {
  const a = String(coreStatus ?? "").trim().toLowerCase();
  const b = String(currentStatus ?? "").trim().toUpperCase();
  return (
    a === "delivered" ||
    a === "cancelled" ||
    b === "DELIVERED" ||
    b === "CANCELLED"
  );
}

/**
 * Validate a scanned pickup token and stamp pickup for the *current* assigned rider.
 * Does NOT permanently burn the token — reassigned riders can reuse the same QR.
 */
export async function validatePickupScan(input: PickupScanInput): Promise<PickupScanResult> {
  const sql = getSql();
  const device = input.device ?? null;

  if (!looksLikeToken(input.token)) {
    await audit(sql, {
      orderId: null, tokenId: null, token: String(input.token ?? "").slice(0, 64),
      riderId: input.riderId, outcome: "REJECTED", reason: "TOKEN_TAMPERED",
      device, latitude: input.latitude, longitude: input.longitude,
    });
    return { ok: false, status: 400, reason: "TOKEN_TAMPERED", message: REJECT_MESSAGE.TOKEN_TAMPERED };
  }

  return sql.begin(async (tx) => {
    const rows = await tx`
      SELECT t.id, t.order_id, t.status, t.assigned_rider_id, t.expires_at,
             oc.order_id AS public_order_id, oc.order_type,
             oc.rider_id AS current_rider_id,
             oc.status AS core_status,
             oc.current_status AS current_status,
             (
               SELECT ora.picked_up_at
               FROM order_rider_assignments ora
               WHERE ora.order_core_id = t.order_id
                 AND ora.rider_id = ${input.riderId}
                 AND ora.is_active IS TRUE
               ORDER BY ora.id DESC
               LIMIT 1
             ) AS active_assignment_picked_up_at
      FROM order_pickup_tokens t
      JOIN orders_core oc ON oc.id = t.order_id
      WHERE t.token = ${input.token}
      FOR UPDATE OF t
      LIMIT 1
    `;
    const row = rows[0] as TokenRow | undefined;

    if (!row) {
      return rejectScan(tx, { token: input.token, riderId: input.riderId, device, ...input }, null, "TOKEN_NOT_FOUND", 404);
    }
    if (row.status === "INVALIDATED") {
      return rejectScan(tx, { token: input.token, riderId: input.riderId, device, ...input }, row, "TOKEN_INVALIDATED", 409);
    }
    if (isTerminalOrderStatus(row.core_status, row.current_status)) {
      // Delivered / Cancelled — QR must not be usable anymore.
      if (row.status !== "EXPIRED" && row.status !== "INVALIDATED") {
        await tx`
          UPDATE order_pickup_tokens
          SET status = 'EXPIRED', expires_at = COALESCE(expires_at, now()), updated_at = now()
          WHERE id = ${row.id}
        `;
      }
      return rejectScan(tx, { token: input.token, riderId: input.riderId, device, ...input }, row, "TOKEN_EXPIRED", 410);
    }
    // Soft-reactivate USED for open orders (reassignment after first scan).
    // Do not revive INVALIDATED. EXPIRED on an open order (legacy 24h TTL) can reopen.
    if (row.status === "USED" || row.status === "EXPIRED") {
      await tx`
        UPDATE order_pickup_tokens
        SET status = 'ACTIVE',
            used_at = NULL,
            expires_at = NULL,
            updated_at = now()
        WHERE id = ${row.id}
      `;
      row.status = "ACTIVE";
    }
    if (row.status !== "ACTIVE") {
      return rejectScan(tx, { token: input.token, riderId: input.riderId, device, ...input }, row, "TOKEN_NOT_ACTIVE", 409);
    }

    const currentRider =
      row.current_rider_id != null && Number.isFinite(Number(row.current_rider_id))
        ? Number(row.current_rider_id)
        : row.assigned_rider_id != null && Number.isFinite(Number(row.assigned_rider_id))
          ? Number(row.assigned_rider_id)
          : null;
    if (currentRider == null || currentRider !== Number(input.riderId)) {
      return rejectScan(tx, { token: input.token, riderId: input.riderId, device, ...input }, row, "WRONG_RIDER", 403);
    }
    if (row.active_assignment_picked_up_at) {
      return rejectScan(tx, { token: input.token, riderId: input.riderId, device, ...input }, row, "ALREADY_PICKED_UP", 409);
    }

    return recordPickupScan(
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
 * Record a successful pickup without burning the QR token.
 * Token stays ACTIVE so a later reassigned rider can scan the same printed code.
 */
async function recordPickupScan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  row: { id: number; order_id: number; public_order_id: string | null; token: string },
  riderId: number,
  device: string | null,
  latitude: number | null | undefined,
  longitude: number | null | undefined
): Promise<PickupScanResult> {
  const pickedUpAt = new Date().toISOString();

  await tx`
    UPDATE order_pickup_tokens
    SET status = 'ACTIVE',
        scanned_at = ${pickedUpAt},
        scanned_by_rider_id = ${riderId},
        scanned_device = ${device},
        assigned_rider_id = ${riderId},
        used_at = NULL,
        expires_at = NULL,
        updated_at = now()
    WHERE id = ${row.id}
  `;

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
        order_status = 'OUT_FOR_DELIVERY',
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
 * Validate a pickup OTP entered by the rider. Same authorization as QR:
 * current assigned rider only; token is not permanently burned.
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
             oc.order_type,
             oc.rider_id AS current_rider_id,
             oc.status AS core_status,
             oc.current_status AS current_status,
             COALESCE(NULLIF(TRIM(of.pickup_otp), ''), NULLIF(TRIM(oc.pickup_otp), '')) AS pickup_otp,
             (
               SELECT ora.picked_up_at
               FROM order_rider_assignments ora
               WHERE ora.order_core_id = t.order_id
                 AND ora.rider_id = ${input.riderId}
                 AND ora.is_active IS TRUE
               ORDER BY ora.id DESC
               LIMIT 1
             ) AS active_assignment_picked_up_at
      FROM order_pickup_tokens t
      JOIN orders_core oc ON oc.id = t.order_id
      LEFT JOIN orders_food of ON of.order_id = oc.id
      WHERE t.order_id = ${input.orderId}
      FOR UPDATE OF t
      LIMIT 1
    `;
    const row = rows[0] as
      | (TokenRow & { token: string; pickup_otp: string | null })
      | undefined;

    if (!row) {
      return rejectScan(
        tx,
        { token: null, riderId: input.riderId, device, ...input },
        { order_id: input.orderId },
        "ORDER_NOT_FOUND",
        404
      );
    }
    if (row.status === "INVALIDATED") {
      return rejectScan(tx, { token: row.token, riderId: input.riderId, device, ...input }, row, "TOKEN_INVALIDATED", 409);
    }
    if (isTerminalOrderStatus(row.core_status, row.current_status)) {
      if (row.status !== "EXPIRED" && row.status !== "INVALIDATED") {
        await tx`
          UPDATE order_pickup_tokens
          SET status = 'EXPIRED', expires_at = COALESCE(expires_at, now()), updated_at = now()
          WHERE id = ${row.id}
        `;
      }
      return rejectScan(tx, { token: row.token, riderId: input.riderId, device, ...input }, row, "TOKEN_EXPIRED", 410);
    }
    if (row.status === "USED" || row.status === "EXPIRED") {
      await tx`
        UPDATE order_pickup_tokens
        SET status = 'ACTIVE', used_at = NULL, expires_at = NULL, updated_at = now()
        WHERE id = ${row.id}
      `;
      row.status = "ACTIVE";
    }
    if (row.status !== "ACTIVE") {
      return rejectScan(tx, { token: row.token, riderId: input.riderId, device, ...input }, row, "TOKEN_NOT_ACTIVE", 409);
    }

    const currentRider =
      row.current_rider_id != null && Number.isFinite(Number(row.current_rider_id))
        ? Number(row.current_rider_id)
        : row.assigned_rider_id != null && Number.isFinite(Number(row.assigned_rider_id))
          ? Number(row.assigned_rider_id)
          : null;
    if (currentRider == null || currentRider !== Number(input.riderId)) {
      return rejectScan(tx, { token: row.token, riderId: input.riderId, device, ...input }, row, "WRONG_RIDER", 403);
    }
    if (row.active_assignment_picked_up_at) {
      return rejectScan(tx, { token: row.token, riderId: input.riderId, device, ...input }, row, "ALREADY_PICKED_UP", 409);
    }
    if (!row.pickup_otp || String(row.pickup_otp).trim() === "") {
      return rejectScan(tx, { token: row.token, riderId: input.riderId, device, ...input }, row, "OTP_UNAVAILABLE", 409);
    }
    if (String(row.pickup_otp).trim() !== otp) {
      return rejectScan(tx, { token: row.token, riderId: input.riderId, device, ...input }, row, "OTP_MISMATCH", 401);
    }

    return recordPickupScan(
      tx,
      { id: row.id, order_id: row.order_id, public_order_id: row.public_order_id, token: row.token },
      input.riderId,
      device,
      input.latitude,
      input.longitude
    );
  });
}

/** Mark scan metadata after Path-B (rider app barcode/OTP) pickup — never burns the QR. */
export async function markPickupTokenScanned(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sqlOrTx: any,
  orderCoreId: number,
  riderId: number
): Promise<void> {
  try {
    await sqlOrTx`
      UPDATE order_pickup_tokens
      SET status = 'ACTIVE',
          scanned_at = COALESCE(scanned_at, now()),
          scanned_by_rider_id = COALESCE(scanned_by_rider_id, ${riderId}),
          assigned_rider_id = ${riderId},
          used_at = NULL,
          expires_at = NULL,
          updated_at = now()
      WHERE order_id = ${orderCoreId}
    `;
  } catch (err) {
    console.warn("[markPickupTokenScanned] failed:", err);
  }
}
