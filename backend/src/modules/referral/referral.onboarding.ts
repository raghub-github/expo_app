/**
 * Merchant onboarding attribution helpers.
 * Partner Site / AM Dashboard call these via public preview + internal apply.
 * They never write referral_relationships directly.
 */

import { getSql } from "../../db/client.js";
import { getReferralConfig, type ReferralUserType } from "./referral.config.service.js";
import { assertReferralUserEligible } from "./referral.eligibility.js";
import { referralTrackingEnabled } from "./referral.participants.js";
import { buildReferralRewardSummary } from "./referral.reward-summary.js";
import {
  REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE,
  REFERRAL_SERVICE_DISABLED,
  isReferralServiceDisabledError,
} from "./referral.errors.js";
import {
  applyReferral,
  lookupReferralCode,
  type ApplyReferralInput,
  type ApplyReferralResult,
} from "./referral.tracking.service.js";

export type MerchantReferralPublicError =
  | "invalid_code"
  | "expired"
  | "not_eligible"
  | "self_referral"
  | "referral_disabled"
  | "REFERRAL_SERVICE_DISABLED";

export type MerchantReferralPreview =
  | {
      ok: true;
      valid: true;
      code: string;
      referrerDisplayName: string | null;
      inviteeRewardLine: string | null;
    }
  | {
      ok: false;
      valid: false;
      error: MerchantReferralPublicError;
      message: string;
    };

const INVALID_MSG = "Invalid referral code. Please check the code and try again.";
const EXPIRED_MSG = "This referral code is no longer valid.";
const NOT_ELIGIBLE_MSG = "This referral cannot be applied to this account.";

export function merchantReferralPublicMessage(error: string): string {
  switch (error) {
    case "invalid_code":
    case "code_user_type_mismatch":
      return INVALID_MSG;
    case "expired":
      return EXPIRED_MSG;
    case "self_referral":
    case "same_phone":
    case "referral_loop":
    case "user_ineligible":
    case "referrer_ineligible":
    case "referrer_limit_reached":
      return NOT_ELIGIBLE_MSG;
    case "referral_disabled":
    case "REFERRAL_SERVICE_DISABLED":
      return REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE;
    case "not_eligible":
    case "already_applied":
      return NOT_ELIGIBLE_MSG;
    default:
      return NOT_ELIGIBLE_MSG;
  }
}

export function classifyMerchantReferralError(error: string): MerchantReferralPublicError {
  if (error === "invalid_code" || error === "code_user_type_mismatch") return "invalid_code";
  if (error === "expired") return "expired";
  if (error === "self_referral") return "self_referral";
  if (isReferralServiceDisabledError(error)) return "REFERRAL_SERVICE_DISABLED";
  return "not_eligible";
}

/** Explicit form entry > deep-link > previously stored pending. */
export function pickMerchantReferralCode(opts: {
  explicit?: string | null;
  deepLink?: string | null;
  stored?: string | null;
}): string | null {
  const n = (v?: string | null) => {
    const t = String(v ?? "").trim().toUpperCase();
    return t.length >= 3 ? t : "";
  };
  return n(opts.explicit) || n(opts.deepLink) || n(opts.stored) || null;
}

async function referrerDisplayName(
  userType: ReferralUserType,
  userId: number,
): Promise<string | null> {
  const sql = getSql();
  if (userType === "merchant") {
    const [row] = await sql<Array<{ owner_name: string | null; parent_name: string | null }>>`
      SELECT owner_name, parent_name
      FROM merchant_parents
      WHERE id = ${userId}
      LIMIT 1
    `.catch(() => [] as Array<{ owner_name: string | null; parent_name: string | null }>);
    const name = row?.parent_name?.trim() || row?.owner_name?.trim() || null;
    return name;
  }
  if (userType === "rider") {
    const [row] = await sql<Array<{ name: string | null }>>`
      SELECT name FROM riders WHERE id = ${userId} LIMIT 1
    `.catch(() => [] as Array<{ name: string | null }>);
    return row?.name?.trim() || null;
  }
  const [row] = await sql<Array<{ full_name: string | null }>>`
    SELECT full_name FROM customers WHERE id = ${userId} LIMIT 1
  `.catch(() => [] as Array<{ full_name: string | null }>);
  return row?.full_name?.trim() || null;
}

export async function previewReferralCode(opts: {
  referralCode: string;
  userType: ReferralUserType;
}): Promise<MerchantReferralPreview> {
  const code = opts.referralCode.trim().toUpperCase();
  if (code.length < 3) {
    return { ok: false, valid: false, error: "invalid_code", message: INVALID_MSG };
  }

  const { settings, rules } = await getReferralConfig({ force: true });
  if (!referralTrackingEnabled(settings, opts.userType)) {
    return {
      ok: false,
      valid: false,
      error: REFERRAL_SERVICE_DISABLED,
      message: REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE,
    };
  }

  const looked = await lookupReferralCode(code);
  if (!looked) {
    return { ok: false, valid: false, error: "invalid_code", message: INVALID_MSG };
  }
  if (looked.userType !== opts.userType) {
    return { ok: false, valid: false, error: "invalid_code", message: INVALID_MSG };
  }

  const referrerOk = await assertReferralUserEligible(looked.userType, looked.userId);
  if (!referrerOk.ok) {
    return { ok: false, valid: false, error: "not_eligible", message: NOT_ELIGIBLE_MSG };
  }

  const name = await referrerDisplayName(looked.userType, looked.userId);
  const summary = buildReferralRewardSummary(settings, rules, opts.userType);
  const inviteeRewardLine =
    summary.rewardsPaused || !summary.inviteeRewardLabel ? null : summary.conditionLine;

  return {
    ok: true,
    valid: true,
    code: looked.referralCode,
    referrerDisplayName: name,
    inviteeRewardLine,
  };
}

export async function resolveMerchantParentPk(
  parentMerchantId: number | string,
): Promise<{ id: number; phone: string | null } | null> {
  const sql = getSql();
  const raw = parentMerchantId;
  if (typeof raw === "number" || /^\d+$/.test(String(raw))) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) return null;
    const [row] = await sql<Array<{ id: string; phone: string | null }>>`
      SELECT id::text, registered_phone AS phone
      FROM merchant_parents
      WHERE id = ${id}
      LIMIT 1
    `.catch(() => [] as Array<{ id: string; phone: string | null }>);
    return row ? { id: Number(row.id), phone: row.phone } : null;
  }
  const publicId = String(raw).trim().toUpperCase();
  if (!publicId) return null;
  const [row] = await sql<Array<{ id: string; phone: string | null }>>`
    SELECT id::text, registered_phone AS phone
    FROM merchant_parents
    WHERE UPPER(TRIM(parent_merchant_id)) = ${publicId}
    LIMIT 1
  `.catch(() => [] as Array<{ id: string; phone: string | null }>);
  return row ? { id: Number(row.id), phone: row.phone } : null;
}

export async function applyMerchantReferralForParent(opts: {
  parentMerchantId: number | string;
  referralCode: string;
  source?: ApplyReferralInput["source"];
  referredPhone?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  createIfMissing?: boolean;
}): Promise<
  | ApplyReferralResult
  | { ok: true; skipped: true; reason: "no_code" | "parent_not_found" | "existing_parent_locked" }
> {
  const code = opts.referralCode.trim().toUpperCase();
  if (!code) return { ok: true, skipped: true, reason: "no_code" };

  const parent = await resolveMerchantParentPk(opts.parentMerchantId);
  if (!parent) return { ok: true, skipped: true, reason: "parent_not_found" };

  const sql = getSql();
  const [existing] = await sql<Array<{ id: string; status: string }>>`
    SELECT id::text, status::text
    FROM referral_relationships
    WHERE user_type = 'merchant'::referral_user_type
      AND referred_user_id = ${parent.id}
    LIMIT 1
  `.catch(() => [] as Array<{ id: string; status: string }>);

  if (existing) {
    return {
      ok: true,
      relationshipId: Number(existing.id),
      status: existing.status,
      alreadyApplied: true,
    };
  }

  if (opts.createIfMissing === false) {
    return { ok: true, skipped: true, reason: "existing_parent_locked" };
  }

  return applyReferral({
    userType: "merchant",
    referredUserId: parent.id,
    referralCode: code,
    source: opts.source ?? "manual",
    referredPhone: opts.referredPhone ?? parent.phone,
    ip: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
  });
}
