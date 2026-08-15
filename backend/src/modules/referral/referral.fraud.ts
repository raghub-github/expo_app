/**
 * Referral fraud checks — driven by referral_settings.fraud_checks JSON.
 */

import { createHash } from "crypto";
import { getSql } from "../../db/client.js";
import type { ReferralFraudChecks, ReferralUserType } from "./referral.config.service.js";

export function hashPhone(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return createHash("sha256").update(digits).digest("hex");
}

export function hashIp(ip: string | null | undefined): string | null {
  const v = String(ip ?? "").trim();
  if (!v) return null;
  return createHash("sha256").update(v).digest("hex");
}

export type FraudContext = {
  userType: ReferralUserType;
  referrerId: number;
  referredUserId: number;
  referralCode: string;
  referredPhone?: string | null;
  referrerPhone?: string | null;
  deviceFingerprint?: string | null;
  installAttributed: boolean;
  autoApplyRequired: boolean;
};

export type FraudResult = {
  ok: boolean;
  flags: string[];
  reason?: string;
};

export async function evaluateReferralFraud(
  checks: ReferralFraudChecks,
  ctx: FraudContext,
): Promise<FraudResult> {
  const flags: string[] = [];

  if (checks.block_self_referral && ctx.referrerId === ctx.referredUserId) {
    flags.push("self_referral");
  }

  if (checks.block_same_phone) {
    const a = hashPhone(ctx.referredPhone);
    const b = hashPhone(ctx.referrerPhone);
    if (a && b && a === b) flags.push("same_phone");
  }

  if (checks.block_same_device && ctx.deviceFingerprint) {
    const sql = getSql();
    const rows = await sql<Array<{ id: string }>>`
      SELECT id::text AS id
      FROM referral_relationships
      WHERE user_type = ${ctx.userType}::referral_user_type
        AND referrer_id = ${ctx.referrerId}
        AND device_fingerprint = ${ctx.deviceFingerprint}
        AND referred_user_id <> ${ctx.referredUserId}
      LIMIT 1
    `;
    if (rows.length > 0) flags.push("same_device_abuse");
  }

  // Deferred deep link / Play Install Referrer required when auto-apply is on
  if (ctx.autoApplyRequired && !ctx.installAttributed) {
    flags.push("no_install_attribution");
  }

  if (flags.length > 0) {
    return {
      ok: false,
      flags,
      reason: flags[0],
    };
  }
  return { ok: true, flags: [] };
}

export async function isOrderQualifyingForReferral(opts: {
  checks: ReferralFraudChecks;
  orderCoreId: number;
  minAmount: number;
  eligibleServices: string[];
}): Promise<{ ok: boolean; amount: number; orderType: string | null; reason?: string }> {
  const sql = getSql();
  const [row] = await sql<Array<{
    status: string | null;
    current_status: string | null;
    order_type: string | null;
    grand_total: string | null;
    fare_amount: string | null;
    cancelled_at: string | null;
  }>>`
    SELECT
      oc.status,
      oc.current_status,
      oc.order_type::text AS order_type,
      oc.grand_total::text,
      oc.fare_amount::text,
      oc.cancelled_at::text
    FROM orders_core oc
    WHERE oc.id = ${opts.orderCoreId}
    LIMIT 1
  `;
  if (!row) return { ok: false, amount: 0, orderType: null, reason: "order_not_found" };

  const status = String(row.current_status ?? row.status ?? "").toUpperCase();
  if (opts.checks.require_delivered_status && status !== "DELIVERED") {
    return { ok: false, amount: 0, orderType: row.order_type, reason: "not_delivered" };
  }
  if (opts.checks.block_cancelled && (row.cancelled_at || status.includes("CANCEL"))) {
    return { ok: false, amount: 0, orderType: row.order_type, reason: "cancelled" };
  }
  if (
    opts.checks.block_returned &&
    (status.includes("RETURN") || status.includes("RTO") || status.includes("UNDELIVER"))
  ) {
    return { ok: false, amount: 0, orderType: row.order_type, reason: "returned" };
  }

  // Refund / return heuristics from payment / flags if present
  if (opts.checks.block_refunded) {
    const [refund] = await sql<Array<{ ok: string }>>`
      SELECT 1::text AS ok
      FROM customer_wallet_transactions cwt
      WHERE cwt.reference_type = 'order'
        AND cwt.reference_id = ${String(opts.orderCoreId)}
        AND cwt.transaction_type = 'REFUND'
      LIMIT 1
    `.catch(() => [] as Array<{ ok: string }>);
    if (refund) return { ok: false, amount: 0, orderType: row.order_type, reason: "refunded" };
  }

  const orderType = String(row.order_type ?? "").toLowerCase();
  const eligible = opts.eligibleServices.map((s: string) => s.toLowerCase());
  // grocery rides food order_type — treat food as covering grocery when listed
  const typeOk =
    eligible.length === 0 ||
    eligible.includes(orderType) ||
    (orderType === "food" && (eligible.includes("food") || eligible.includes("grocery")));
  if (!typeOk) {
    return { ok: false, amount: 0, orderType: row.order_type, reason: "service_not_eligible" };
  }

  const amount = Number(row.grand_total ?? row.fare_amount ?? 0);
  if (!(amount >= opts.minAmount)) {
    return { ok: false, amount, orderType: row.order_type, reason: "below_min_order" };
  }

  return { ok: true, amount, orderType: row.order_type };
}
