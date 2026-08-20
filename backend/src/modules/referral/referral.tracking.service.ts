/**
 * Referral tracking — codes, apply, relationships, install attribution.
 */

import { randomBytes } from "crypto";
import { getSql } from "../../db/client.js";
import {
  getReferralSettings,
  type ReferralUserType,
} from "./referral.config.service.js";
import { hashIp, hashPhone } from "./referral.fraud.js";
import { evaluateAdvancedReferralFraud } from "./referral.fraud.advanced.js";
import { getOrCreateReferralCode, findExistingReferralCode } from "./referral.codes.js";
import { deepLinkPathFor, referralTrackingEnabled } from "./referral.participants.js";
import {
  assertReferralUserEligible,
  expiresAtFromValidityDays,
} from "./referral.eligibility.js";
import { REFERRAL_SERVICE_DISABLED } from "./referral.errors.js";

export type ApplyReferralInput = {
  userType: ReferralUserType;
  referredUserId: number;
  referralCode: string;
  source?: "deep_link" | "play_install_referrer" | "manual" | "share_sheet" | "unknown";
  installAttributed?: boolean;
  clickToken?: string | null;
  deviceFingerprint?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  referredPhone?: string | null;
};

export type ApplyReferralResult =
  | { ok: true; relationshipId: number; status: string; alreadyApplied?: boolean }
  | { ok: false; error: string; flags?: string[] };

async function lookupCode(code: string): Promise<{
  userType: ReferralUserType;
  userId: number;
  referralCode: string;
} | null> {
  const sql = getSql();
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const [fromUnified] = await sql<Array<{ user_type: string; user_id: string; referral_code: string }>>`
    SELECT user_type::text, user_id::text, referral_code
    FROM referral_codes
    WHERE referral_code = ${normalized}
      AND active = true
      AND COALESCE(suspended, false) = false
    LIMIT 1
  `.catch(() => [] as Array<{ user_type: string; user_id: string; referral_code: string }>);

  if (fromUnified) {
    return {
      userType: fromUnified.user_type as ReferralUserType,
      userId: Number(fromUnified.user_id),
      referralCode: fromUnified.referral_code,
    };
  }

  const [customer] = await sql<Array<{ id: string; referral_code: string }>>`
    SELECT id::text, referral_code
    FROM customers
    WHERE UPPER(TRIM(referral_code)) = ${normalized}
    LIMIT 1
  `;
  if (customer?.referral_code) {
    await ensureReferralCodeRow("customer", Number(customer.id), customer.referral_code);
    return {
      userType: "customer",
      userId: Number(customer.id),
      referralCode: customer.referral_code.toUpperCase(),
    };
  }

  const [rider] = await sql<Array<{ id: string; referral_code: string }>>`
    SELECT id::text, referral_code
    FROM riders
    WHERE UPPER(TRIM(referral_code)) = ${normalized}
    LIMIT 1
  `;
  if (rider?.referral_code) {
    await ensureReferralCodeRow("rider", Number(rider.id), rider.referral_code);
    return {
      userType: "rider",
      userId: Number(rider.id),
      referralCode: rider.referral_code.toUpperCase(),
    };
  }

  const [merchant] = await sql<Array<{ id: string; referral_code: string }>>`
    SELECT id::text, referral_code
    FROM merchant_parents
    WHERE UPPER(TRIM(referral_code)) = ${normalized}
    LIMIT 1
  `.catch(() => [] as Array<{ id: string; referral_code: string }>);
  if (merchant?.referral_code) {
    await ensureReferralCodeRow("merchant", Number(merchant.id), merchant.referral_code);
    return {
      userType: "merchant",
      userId: Number(merchant.id),
      referralCode: merchant.referral_code.toUpperCase(),
    };
  }

  return null;
}

export async function ensureReferralCodeRow(
  userType: ReferralUserType,
  userId: number,
  referralCode: string,
): Promise<void> {
  const sql = getSql();
  const code = referralCode.trim().toUpperCase();
  if (!code) return;
  await sql`
    INSERT INTO referral_codes (user_type, user_id, referral_code, active)
    VALUES (${userType}::referral_user_type, ${userId}, ${code}, true)
    ON CONFLICT (user_type, user_id) DO UPDATE
      SET
        regenerated_from = CASE
          WHEN referral_codes.referral_code IS DISTINCT FROM EXCLUDED.referral_code
          THEN referral_codes.referral_code
          ELSE referral_codes.regenerated_from
        END,
        referral_code = EXCLUDED.referral_code,
        active = true,
        suspended = false,
        updated_at = NOW()
  `.catch(() => undefined);
}

export async function resolveReferrerPhone(
  userType: ReferralUserType,
  userId: number,
): Promise<string | null> {
  const sql = getSql();
  if (userType === "customer") {
    const [row] = await sql<Array<{ phone: string | null }>>`
      SELECT primary_mobile AS phone FROM customers WHERE id = ${userId} LIMIT 1
    `;
    return row?.phone ?? null;
  }
  if (userType === "merchant") {
    const [row] = await sql<Array<{ phone: string | null }>>`
      SELECT registered_phone AS phone FROM merchant_parents WHERE id = ${userId} LIMIT 1
    `;
    return row?.phone ?? null;
  }
  const [row] = await sql<Array<{ phone: string | null }>>`
    SELECT mobile AS phone FROM riders WHERE id = ${userId} LIMIT 1
  `;
  return row?.phone ?? null;
}

export async function applyReferral(input: ApplyReferralInput): Promise<ApplyReferralResult> {
  const settings = await getReferralSettings(true);
  const sql = getSql();

  // Existing relationship is not a NEW application — OFF must not rewrite or delete it.
  const [existing] = await sql<Array<{ id: string; status: string }>>`
    SELECT id::text, status::text
    FROM referral_relationships
    WHERE user_type = ${input.userType}::referral_user_type
      AND referred_user_id = ${input.referredUserId}
    LIMIT 1
  `;
  if (existing) {
    return {
      ok: true,
      relationshipId: Number(existing.id),
      status: existing.status,
      alreadyApplied: true,
    };
  }

  if (!referralTrackingEnabled(settings, input.userType)) {
    return { ok: false, error: REFERRAL_SERVICE_DISABLED };
  }

  const looked = await lookupCode(input.referralCode);
  if (!looked) return { ok: false, error: "invalid_code" };
  if (looked.userType !== input.userType) {
    return { ok: false, error: "code_user_type_mismatch" };
  }

  const referredOk = await assertReferralUserEligible(input.userType, input.referredUserId);
  if (!referredOk.ok) return { ok: false, error: "user_ineligible" };
  const referrerOk = await assertReferralUserEligible(looked.userType, looked.userId);
  if (!referrerOk.ok) return { ok: false, error: "referrer_ineligible" };

  const applyLockKey = `ref_apply_${input.userType}_${looked.userId}`;
  await sql`SELECT pg_advisory_lock(hashtext(${applyLockKey}))`;

  try {
  // Re-check under lock in case a concurrent apply won.
  const [existingLocked] = await sql<Array<{ id: string; status: string }>>`
    SELECT id::text, status::text
    FROM referral_relationships
    WHERE user_type = ${input.userType}::referral_user_type
      AND referred_user_id = ${input.referredUserId}
    LIMIT 1
  `;
  if (existingLocked) {
    return {
      ok: true,
      relationshipId: Number(existingLocked.id),
      status: existingLocked.status,
      alreadyApplied: true,
    };
  }

  const settingsNow = await getReferralSettings(true);
  if (!referralTrackingEnabled(settingsNow, input.userType)) {
    return { ok: false, error: REFERRAL_SERVICE_DISABLED };
  }

  const maxRefs = settings.max_successful_referrals;
  if (maxRefs != null && Number.isFinite(maxRefs) && maxRefs > 0) {
    const [cnt] = await sql<Array<{ n: string }>>`
      SELECT COUNT(*)::text AS n
      FROM referral_relationships
      WHERE user_type = ${input.userType}::referral_user_type
        AND referrer_id = ${looked.userId}
        AND status NOT IN ('fraud_blocked', 'cancelled', 'ineligible')
    `;
    if (Number(cnt?.n ?? 0) >= maxRefs) {
      return { ok: false, error: "referrer_limit_reached" };
    }
  }

  let installAttributed = Boolean(input.installAttributed);
  if (input.clickToken) {
    const [click] = await sql<Array<{ id: string; referral_code: string; consumed: boolean }>>`
      SELECT id::text, referral_code, consumed
      FROM referral_install_clicks
      WHERE click_token = ${input.clickToken}
        AND expires_at > NOW()
      LIMIT 1
    `;
    if (click && !click.consumed && click.referral_code === looked.referralCode) {
      installAttributed = true;
      await sql`
        UPDATE referral_install_clicks
        SET consumed = true,
            consumed_at = NOW(),
            consumed_by_user_id = ${input.referredUserId}
        WHERE id = ${Number(click.id)}
      `;
    }
  }

  // Play Install Referrer path: if source is play_install_referrer, treat as attributed
  if (input.source === "play_install_referrer" || input.source === "deep_link") {
    installAttributed = true;
  }

  const referrerPhone = await resolveReferrerPhone(looked.userType, looked.userId);
  const fraud = await evaluateAdvancedReferralFraud({
    userType: input.userType,
    referrerId: looked.userId,
    referredUserId: input.referredUserId,
    referralCode: looked.referralCode,
    referredPhone: input.referredPhone,
    referrerPhone,
    deviceFingerprint: input.deviceFingerprint,
    installAttributed: settings.auto_apply_enabled ? installAttributed : true,
    autoApplyRequired: settings.auto_apply_enabled && input.source !== "manual",
    ip: input.ip,
  });

  // Manual entry is only allowed when auto_apply is off OR admin allows — PRD says
  // users should NEVER manually enter when coming from link. Manual is blocked when
  // auto_apply_enabled unless explicitly allowed via source=manual and settings say so.
  if (settings.auto_apply_enabled && input.source === "manual") {
    // Allow manual only as fallback when fraud says no attribution — still block self etc.
    // Keep manual for legacy onboarding screens, but mark source.
  }

  if (!fraud.ok && fraud.flags.includes("self_referral")) {
    return { ok: false, error: "self_referral", flags: fraud.flags };
  }
  if (!fraud.ok && fraud.flags.includes("same_phone")) {
    return { ok: false, error: "same_phone", flags: fraud.flags };
  }
  if (!fraud.ok && fraud.flags.includes("referral_loop")) {
    return { ok: false, error: "referral_loop", flags: fraud.flags };
  }
  if (!fraud.ok && fraud.flags.includes("velocity_abuse")) {
    return { ok: false, error: "velocity_abuse", flags: fraud.flags };
  }

  const status =
    !fraud.ok && fraud.flags.includes("no_install_attribution")
      ? "fraud_blocked"
      : !fraud.ok
        ? "fraud_blocked"
        : input.userType === "customer"
          ? "first_order_pending"
          : "milestone_pending";

  const autoApplied = installAttributed && status !== "fraud_blocked";

  const [campaign] = await sql<Array<{ id: string; referral_validity_days: number | null }>>`
    SELECT id::text, referral_validity_days
    FROM referral_campaigns
    WHERE enabled = true
      AND (user_type IS NULL OR user_type = ${input.userType}::referral_user_type)
      AND (starts_at IS NULL OR starts_at <= NOW())
      AND (ends_at IS NULL OR ends_at >= NOW())
    ORDER BY priority ASC, id ASC
    LIMIT 1
  `.catch(() => [] as Array<{ id: string; referral_validity_days: number | null }>);
  const campaignId = campaign?.id ? Number(campaign.id) : null;
  const validityDays =
    campaign?.referral_validity_days ?? settings.referral_validity_days ?? 365;
  const expiresAt = expiresAtFromValidityDays(
    validityDays,
    settings.referral_expiry_enabled !== false,
  );

  const [inserted] = await sql<Array<{ id: string; status: string }>>`
    INSERT INTO referral_relationships (
      user_type, referrer_id, referred_user_id, referral_code, source,
      install_at, app_open_at, auto_applied, status, reward_status,
      device_fingerprint, phone_hash, fraud_flags, metadata,
      campaign_id, expires_at
    ) VALUES (
      ${input.userType}::referral_user_type,
      ${looked.userId},
      ${input.referredUserId},
      ${looked.referralCode},
      ${input.source ?? "unknown"}::referral_attribution_source,
      ${installAttributed ? new Date().toISOString() : null},
      NOW(),
      ${autoApplied},
      ${status}::referral_relationship_status,
      ${status === "fraud_blocked" ? "blocked" : "pending"},
      ${input.deviceFingerprint ?? null},
      ${hashPhone(input.referredPhone)},
      ${JSON.stringify(fraud.flags)}::text::jsonb,
      ${JSON.stringify({
        ip_hash: hashIp(input.ip),
        user_agent: input.userAgent ?? null,
        campaign_code: campaignId,
      })}::text::jsonb,
      ${campaignId},
      ${expiresAt ? expiresAt.toISOString() : null}
    )
    ON CONFLICT (user_type, referred_user_id) DO NOTHING
    RETURNING id::text, status::text
  `;

  if (!inserted) {
    const [again] = await sql<Array<{ id: string; status: string }>>`
      SELECT id::text, status::text
      FROM referral_relationships
      WHERE user_type = ${input.userType}::referral_user_type
        AND referred_user_id = ${input.referredUserId}
      LIMIT 1
    `;
    if (again) {
      return {
        ok: true,
        relationshipId: Number(again.id),
        status: again.status,
        alreadyApplied: true,
      };
    }
    return { ok: false, error: "apply_failed" };
  }

  // Sync legacy columns for backward compatibility
  if (input.userType === "customer") {
    await sql`
      UPDATE customers
      SET referred_by = ${looked.referralCode},
          referrer_customer_id = ${looked.userId}
      WHERE id = ${input.referredUserId}
        AND (referrer_customer_id IS NULL OR referrer_customer_id = ${looked.userId})
    `.catch(() => undefined);

    await sql`
      INSERT INTO customer_referrals (
        referrer_customer_id, referred_customer_id, referral_code, referral_status
      ) VALUES (
        ${looked.userId}, ${input.referredUserId}, ${looked.referralCode}, 'PENDING'
      )
      ON CONFLICT (referred_customer_id) DO NOTHING
    `.catch(() => undefined);
  } else if (input.userType === "rider") {
    await sql`
      UPDATE riders
      SET referred_by = ${looked.userId}
      WHERE id = ${input.referredUserId}
        AND referred_by IS NULL
    `.catch(() => undefined);

    await sql`
      INSERT INTO referrals (referrer_id, referred_id, referral_code_used)
      VALUES (${looked.userId}, ${input.referredUserId}, ${looked.referralCode})
      ON CONFLICT (referred_id) DO NOTHING
    `.catch(() => undefined);
  }

  if (status === "fraud_blocked") {
    return {
      ok: false,
      error: fraud.reason ?? "fraud_blocked",
      flags: fraud.flags,
    };
  }

  if (input.userType === "merchant") {
    try {
      const { evaluateMerchantReferralOnEvent } = await import("./referral.engine.js");
      await evaluateMerchantReferralOnEvent({
        merchantParentId: input.referredUserId,
        eventType: "REGISTRATION_COMPLETED",
      });
      await evaluateMerchantReferralOnEvent({
        merchantParentId: input.referredUserId,
        eventType: "SIGNUP",
      });
    } catch {
      /* evaluation is best-effort */
    }
  }

  return {
    ok: true,
    relationshipId: Number(inserted.id),
    status: inserted.status,
  };
  } finally {
    await sql`SELECT pg_advisory_unlock(hashtext(${applyLockKey}))`.catch(() => undefined);
  }
}

export async function recordReferralInstallClick(opts: {
  referralCode: string;
  userType: ReferralUserType;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ clickToken: string; playReferrer: string } | null> {
  const looked = await lookupCode(opts.referralCode);
  if (!looked || looked.userType !== opts.userType) return null;

  const settings = await getReferralSettings();
  const clickToken = randomBytes(12).toString("hex");
  const playReferrer = `${settings.deep_link.referrer_prefix}${looked.referralCode}`;
  const sql = getSql();

  await sql`
    INSERT INTO referral_install_clicks (
      referral_code, user_type, click_token, play_referrer, ip_hash, user_agent
    ) VALUES (
      ${looked.referralCode},
      ${opts.userType}::referral_user_type,
      ${clickToken},
      ${playReferrer},
      ${hashIp(opts.ip)},
      ${opts.userAgent ?? null}
    )
  `;

  return { clickToken, playReferrer };
}

export async function getMyReferralProfile(opts: {
  userType: ReferralUserType;
  userId: number;
}): Promise<{
  referralCode: string | null;
  shareUrl: string | null;
  history: Array<Record<string, unknown>>;
  stats: {
    totalReferrals: number;
    totalActive: number;
    totalEarned: number;
  };
}> {
  const sql = getSql();
  const settings = await getReferralSettings();

  // Already-registered users keep the code they have; only users without one
  // get a freshly generated code. When the service toggle is OFF we still
  // return an existing published code (for Super Admin / history) but do not
  // allocate a new one.
  let code: string | null = null;
  try {
    if (referralTrackingEnabled(settings, opts.userType)) {
      code = await getOrCreateReferralCode(opts.userType, opts.userId);
    } else {
      code = await findExistingReferralCode(opts.userType, opts.userId);
    }
  } catch (err) {
    console.warn("[referral] code resolution failed", (err as Error).message);
    code = null;
  }

  if (code) await ensureReferralCodeRow(opts.userType, opts.userId, code);

  const trackingOn = referralTrackingEnabled(settings, opts.userType);
  const prefix = deepLinkPathFor(settings, opts.userType);
  const base = resolveReferralPublicBaseFor(opts.userType);
  const shareUrl =
    trackingOn && code ? `${base}${prefix.startsWith("/") ? prefix : `/${prefix}`}/${code}` : null;

  const historySql =
    opts.userType === "customer"
      ? sql<Array<Record<string, unknown>>>`
          SELECT
            rr.id::text AS id, rr.referred_user_id::text AS referred_user_id,
            c.customer_id AS referred_display_id, c.full_name AS referred_name,
            rr.status::text AS status, rr.reward_status, rr.completed_orders,
            rr.kyc_approved, rr.auto_applied, rr.created_at,
            (
              SELECT COALESCE(SUM(rtx.reward_amount), 0)
              FROM referral_reward_transactions rtx
              WHERE rtx.referral_relationship_id = rr.id
                AND rtx.status = 'credited' AND rtx.reward_party = 'referrer'
            ) AS reward_earned
          FROM referral_relationships rr
          LEFT JOIN customers c ON c.id = rr.referred_user_id
          WHERE rr.user_type = 'customer'::referral_user_type AND rr.referrer_id = ${opts.userId}
          ORDER BY rr.created_at DESC LIMIT 100
        `
      : opts.userType === "merchant"
        ? sql<Array<Record<string, unknown>>>`
            SELECT
              rr.id::text AS id, rr.referred_user_id::text AS referred_user_id,
              mp.parent_merchant_id AS referred_display_id,
              COALESCE(mp.brand_name, mp.parent_name, mp.owner_name) AS referred_name,
              rr.status::text AS status, rr.reward_status, rr.completed_orders,
              rr.kyc_approved, rr.auto_applied, rr.created_at,
              (
                SELECT COALESCE(SUM(rtx.reward_amount), 0)
                FROM referral_reward_transactions rtx
                WHERE rtx.referral_relationship_id = rr.id
                  AND rtx.status = 'credited' AND rtx.reward_party = 'referrer'
              ) AS reward_earned
            FROM referral_relationships rr
            LEFT JOIN merchant_parents mp ON mp.id = rr.referred_user_id
            WHERE rr.user_type = 'merchant'::referral_user_type AND rr.referrer_id = ${opts.userId}
            ORDER BY rr.created_at DESC LIMIT 100
          `
        : sql<Array<Record<string, unknown>>>`
            SELECT
              rr.id::text AS id, rr.referred_user_id::text AS referred_user_id,
              COALESCE('GMR' || r.id::text, rr.referred_user_id::text) AS referred_display_id,
              r.name AS referred_name,
              rr.status::text AS status, rr.reward_status, rr.completed_orders,
              rr.kyc_approved, rr.auto_applied, rr.created_at,
              (
                SELECT COALESCE(SUM(rtx.reward_amount), 0)
                FROM referral_reward_transactions rtx
                WHERE rtx.referral_relationship_id = rr.id
                  AND rtx.status = 'credited' AND rtx.reward_party = 'referrer'
              ) AS reward_earned
            FROM referral_relationships rr
            LEFT JOIN riders r ON r.id = rr.referred_user_id
            WHERE rr.user_type = 'rider'::referral_user_type AND rr.referrer_id = ${opts.userId}
            ORDER BY rr.created_at DESC LIMIT 100
          `;

  const history = await historySql.catch(() => [] as Array<Record<string, unknown>>);

  const mapped = history.map((row) => {
    const status = String(row.status ?? "");
    const rewardEarned = Number(row.reward_earned ?? 0) || 0;
    const active =
      status !== "cancelled" &&
      status !== "fraud_blocked" &&
      status !== "pending";
    const rawDisplay =
      row.referred_display_id != null ? String(row.referred_display_id).trim() : "";
    // Customers: only public customer_id (never DB PK). Riders: GMR{id} from SQL.
    const displayId =
      rawDisplay ||
      (opts.userType === "rider" && row.referred_user_id != null
        ? `GMR${row.referred_user_id}`
        : "");
    return {
      ...row,
      id: row.id != null ? String(row.id) : null,
      referred_user_id: row.referred_user_id != null ? String(row.referred_user_id) : null,
      referred_display_id: displayId || null,
      referred_name: row.referred_name != null ? String(row.referred_name) : null,
      reward_earned: rewardEarned,
      is_active: active,
    };
  });

  const totalReferrals = mapped.length;
  const totalActive = mapped.filter((r) => r.is_active).length;
  const totalEarned = mapped.reduce((sum, r) => sum + Number(r.reward_earned || 0), 0);

  return {
    referralCode: code,
    shareUrl,
    history: mapped,
    stats: {
      totalReferrals,
      totalActive,
      totalEarned: Math.round(totalEarned * 100) / 100,
    },
  };
}

const DEFAULT_CUSTOMER_RIDER_REFERRAL_BASE = "https://gatimitra.com";
export const DEFAULT_MERCHANT_REFERRAL_PUBLIC_BASE = "https://partner.gatimitra.com";

function isPublicShareHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host !== "localhost" &&
    host !== "127.0.0.1" &&
    !/^192\.168\./.test(host) &&
    !/^10\./.test(host)
  );
}

function firstPublicBase(candidates: Array<string | undefined>): string | null {
  for (const raw of candidates) {
    const explicit = raw?.replace(/\/+$/, "");
    if (!explicit) continue;
    try {
      if (isPublicShareHost(new URL(explicit).hostname)) return explicit;
    } catch {
      /* fall through */
    }
  }
  return null;
}

export function resolveReferralPublicBase(): string {
  return (
    firstPublicBase([
      process.env.REFERRAL_LINK_BASE_URL,
      process.env.ADDRESS_LINK_BASE_URL,
    ]) || DEFAULT_CUSTOMER_RIDER_REFERRAL_BASE
  );
}

/** Merchant share / deep links open Partner Site onboarding, not gatimitra.com. */
export function resolveReferralPublicBaseFor(userType: ReferralUserType): string {
  if (userType === "merchant") {
    return (
      firstPublicBase([
        process.env.MERCHANT_REFERRAL_LINK_BASE_URL,
        process.env.PARTNER_SITE_URL,
      ]) || DEFAULT_MERCHANT_REFERRAL_PUBLIC_BASE
    );
  }
  return resolveReferralPublicBase();
}

export async function lookupReferralCode(code: string): Promise<{
  userType: ReferralUserType;
  userId: number;
  referralCode: string;
} | null> {
  return lookupCode(code);
}
