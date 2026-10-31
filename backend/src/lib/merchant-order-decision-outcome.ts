import type { Sql } from "postgres";

/**
 * Turns a failed store decision into something the device that lost can act on.
 *
 * One order is shown on every device signed into a store, so a rejected accept
 * is usually not a bug — it is a second counter tapping a card another device
 * already handled. That reads as `invalid_transition:<from>:<to>` internally,
 * which was being returned verbatim as HTTP 400. Staff saw a developer string,
 * and 400 told the client the request was malformed and worth retrying when in
 * fact the question was already settled.
 */

/**
 * Spellings that all mean "waiting for the store to decide".
 *
 * Matched whole and case-insensitively, never as substrings. The guards used to
 * do REPLACE("NEW","CREATED") — a substring swap — and the SQL ones ran it
 * *before* UPPER, so a row stored as lowercase "new" normalised to "NEW" in SQL
 * but "CREATED" in TypeScript. The accept guard then refused the row and the
 * cancel compare-and-swap never matched, leaving the order undecidable by the
 * store rather than merely racing. "RENEWED" became "RECREATEDED".
 */
export const PENDING_DECISION_STATUSES = [
  "CREATED",
  "NEW",
  "PLACED",
  "ORDER_RECEIVED",
  "ORDER_PLACED",
];

const PENDING = new Set(PENDING_DECISION_STATUSES);

/**
 * Canonical status for transition checks. Must stay identical to the SQL
 * emitted by normalizedFoodStatusSql(), or a compare-and-swap guard and the
 * status TypeScript read will disagree and the decision will silently fail.
 */
export function normalizeOrderStatusForTransition(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim().toUpperCase() || "CREATED";
  return PENDING.has(s) ? "CREATED" : s;
}

export type MerchantDecisionOutcome = {
  /** HTTP status for the response. */
  status: 409 | 400;
  /** Stable code the app branches on. */
  code: "order_already_decided" | "order_expired" | "invalid_transition";
  /** Shown to staff as-is. */
  message: string;
  /** Normalised status the order was actually in when the decision was refused. */
  actualStatus: string;
};

function titleCase(status: string): string {
  switch (status) {
    case "ACCEPTED":
      return "accepted";
    case "CANCELLED":
      return "cancelled";
    case "PREPARING":
      return "already being prepared";
    case "READY_FOR_PICKUP":
      return "ready for pickup";
    case "OUT_FOR_DELIVERY":
      return "out for delivery";
    case "DELIVERED":
      return "delivered";
    case "RTO":
      return "returned";
    default:
      return status.toLowerCase().replace(/_/g, " ");
  }
}

/**
 * `raw` is the `invalid_transition:<from>:<to>` thrown by the decision guards.
 * `from` is the status the order was found in, which is what distinguishes a
 * genuine race from an actually illegal transition.
 *
 * `decidedOnDevice` names the store device that won, when it is known. "already
 * accepted on Kitchen tablet" tells a counter who to ask; "on another device"
 * is the honest fallback when the deciding device was not recorded — which is
 * every order decided before migration 0646, and anything decided by cron or
 * admin tooling rather than a device.
 */
export function classifyMerchantDecisionFailure(
  raw: string,
  decidedOnDevice?: string | null
): MerchantDecisionOutcome {
  const where = String(decidedOnDevice ?? "").trim() || "another device";
  const [, fromRaw = "", toRaw = ""] = raw.split(":");
  const from = fromRaw.trim().toUpperCase();
  const to = toRaw.trim().toUpperCase();

  // The order was no longer pending, so some other device — or the expiry job —
  // got there first. That is a conflict, not a bad request.
  if (from && !PENDING.has(from)) {
    return {
      status: 409,
      code: "order_already_decided",
      message: `This order was already ${titleCase(from)} on ${where}.`,
      actualStatus: from,
    };
  }

  // Still pending but the requested move is not legal from here — a real
  // client-side mistake rather than a race.
  return {
    status: 400,
    code: "invalid_transition",
    message: `This order cannot move to ${titleCase(to)} right now.`,
    actualStatus: from || "CREATED",
  };
}

/**
 * Human name of the device whose decision won, for the conflict message.
 *
 * Tolerates migration 0646 not being applied: without decision_device_id there
 * is simply nothing to name, and the caller falls back to "another device".
 * Never throws — this runs on an error path that must still produce a reply.
 */
export async function lookupDecidingDeviceName(
  sql: Sql,
  ordersFoodId: number
): Promise<string | null> {
  try {
    const rows = (await sql`
      SELECT COALESCE(NULLIF(TRIM(s.device_name), ''), NULLIF(TRIM(s.device_model), '')) AS name
      FROM orders_food f
      LEFT JOIN user_device_sessions s ON s.device_id = f.decision_device_id
      WHERE f.id = ${ordersFoodId} AND f.decision_device_id IS NOT NULL
      ORDER BY s.last_active DESC NULLS LAST
      LIMIT 1
    `) as unknown as Array<{ name: string | null }>;
    const name = String(rows?.[0]?.name ?? "").trim();
    return name || null;
  } catch {
    // Column absent (pre-0646) or the lookup failed — the message degrades.
    return null;
  }
}
