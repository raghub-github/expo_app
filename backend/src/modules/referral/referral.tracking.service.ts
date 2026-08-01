/**
 * Referral tracking — codes, apply, relationships, install attribution.
 */

import { randomBytes } from "crypto";
import { getSql } from "../../db/client.js";
import {
  getReferralSettings,
  type ReferralUserType,
} from "./referral.config.service.js";
import {
  evaluateReferralFraud,
  hashIp,
  hashPhone,
} from "./referral.fraud.js";
import { getOrCreateReferralCode } from "./referral.codes.js";

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
    WHERE referral_code = ${normalized} AND active = true
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
    ON CONFLICT (referral_code) DO UPDATE
      SET user_type = EXCLUDED.user_type,
          user_id = EXCLUDED.user_id,
          active = true,
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
  const [row] = await sql<Array<{ phone: string | null }>>`
    SELECT mobile AS phone FROM riders WHERE id = ${userId} LIMIT 1
  `;
  return row?.phone ?? null;
}

export async function applyReferral(input: ApplyReferralInput): Promise<ApplyReferralResult> {
  const settings = await getReferralSettings();
  if (!settings.enabled) {
    // Tracking continues even when disabled — still create relationship, no rewards later
  }
  if (input.userType === "customer" && !settings.customer_referral_enabled && settings.enabled) {
    // Still allow tracking when global enabled but customer flag off? PRD: links work, tracking continues.
  }
  if (input.userType === "rider" && !settings.rider_referral_enabled && settings.enabled) {
    // same
  }

  const looked = await lookupCode(input.referralCode);
  if (!looked) return { ok: false, error: "invalid_code" };
  if (looked.userType !== input.userType) {
    return { ok: false, error: "code_user_type_mismatch" };
  }

  const sql = getSql();

  // Already applied?
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
  const fraud = await evaluateReferralFraud(settings.fraud_checks, {
    userType: input.userType,
    referrerId: looked.userId,
    referredUserId: input.referredUserId,
    referralCode: looked.referralCode,
    referredPhone: input.referredPhone,
    referrerPhone,
    deviceFingerprint: input.deviceFingerprint,
    installAttributed: settings.auto_apply_enabled ? installAttributed : true,
    autoApplyRequired: settings.auto_apply_enabled && input.source !== "manual",
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

  const status =
    !fraud.ok && fraud.flags.includes("no_install_attribution")
      ? "fraud_blocked"
      : !fraud.ok
        ? "fraud_blocked"
        : input.userType === "customer"
          ? "first_order_pending"
          : "milestone_pending";

  const autoApplied = installAttributed && status !== "fraud_blocked";

  const [inserted] = await sql<Array<{ id: string; status: string }>>`
    INSERT INTO referral_relationships (
      user_type, referrer_id, referred_user_id, referral_code, source,
      install_at, app_open_at, auto_applied, status, reward_status,
      device_fingerprint, phone_hash, fraud_flags, metadata
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
      ${JSON.stringify(fraud.flags)}::jsonb,
      ${JSON.stringify({
        ip_hash: hashIp(input.ip),
        user_agent: input.userAgent ?? null,
      })}::jsonb
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
  } else {
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

  return {
    ok: true,
    relationshipId: Number(inserted.id),
    status: inserted.status,
  };
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
  // get a freshly generated code.
  let code: string | null = null;
  try {
    code = await getOrCreateReferralCode(opts.userType, opts.userId);
  } catch (err) {
    console.warn("[referral] code resolution failed", (err as Error).message);
    code = null;
  }

  if (code) await ensureReferralCodeRow(opts.userType, opts.userId, code);

  const prefix =
    opts.userType === "customer"
      ? settings.deep_link.customer_path_prefix
      : settings.deep_link.rider_path_prefix;
  const base = resolveReferralPublicBase();
  const shareUrl = code ? `${base}${prefix.startsWith("/") ? prefix : `/${prefix}`}/${code}` : null;

  // Join profile tables so clients never need to show raw PKs.
  const history =
    opts.userType === "customer"
      ? await sql<Array<Record<string, unknown>>>`
          SELECT
            rr.id,
            rr.referred_user_id,
            c.customer_id AS referred_display_id,
            c.full_name AS referred_name,
            rr.status::text AS status,
            rr.reward_status,
            rr.completed_orders,
            rr.kyc_approved,
            rr.auto_applied,
            rr.created_at,
            (
              SELECT COALESCE(SUM(rtx.reward_amount), 0)
              FROM referral_reward_transactions rtx
              WHERE rtx.referral_relationship_id = rr.id
                AND rtx.status = 'credited'
                AND rtx.reward_party = 'referrer'
            ) AS reward_earned
          FROM referral_relationships rr
          LEFT JOIN customers c ON c.id = rr.referred_user_id
          WHERE rr.user_type = 'customer'::referral_user_type
            AND rr.referrer_id = ${opts.userId}
          ORDER BY rr.created_at DESC
          LIMIT 100
        `.catch(() => [] as Array<Record<string, unknown>>)
      : await sql<Array<Record<string, unknown>>>`
          SELECT
            rr.id,
            rr.referred_user_id,
            COALESCE('GMR' || r.id::text, rr.referred_user_id::text) AS referred_display_id,
            r.name AS referred_name,
            rr.status::text AS status,
            rr.reward_status,
            rr.completed_orders,
            rr.kyc_approved,
            rr.auto_applied,
            rr.created_at,
            (
              SELECT COALESCE(SUM(rtx.reward_amount), 0)
              FROM referral_reward_transactions rtx
              WHERE rtx.referral_relationship_id = rr.id
                AND rtx.status = 'credited'
                AND rtx.reward_party = 'referrer'
            ) AS reward_earned
          FROM referral_relationships rr
          LEFT JOIN riders r ON r.id = rr.referred_user_id
          WHERE rr.user_type = 'rider'::referral_user_type
            AND rr.referrer_id = ${opts.userId}
          ORDER BY rr.created_at DESC
          LIMIT 100
        `.catch(() => [] as Array<Record<string, unknown>>);

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

export function resolveReferralPublicBase(): string {
  const explicit =
    process.env.REFERRAL_LINK_BASE_URL?.replace(/\/+$/, "") ||
    process.env.ADDRESS_LINK_BASE_URL?.replace(/\/+$/, "");
  if (explicit) {
    try {
      const host = new URL(explicit).hostname.toLowerCase();
      // Never put localhost / LAN hosts into shareable referral links.
      if (
        host !== "localhost" &&
        host !== "127.0.0.1" &&
        !/^192\.168\./.test(host) &&
        !/^10\./.test(host)
      ) {
        return explicit;
      }
    } catch {
      /* fall through */
    }
  }
  // App Links are verified on gatimitra.com; override via REFERRAL_LINK_BASE_URL if needed.
  return "https://gatimitra.com";
}
