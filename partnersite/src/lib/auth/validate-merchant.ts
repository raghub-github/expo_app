/**
 * Validate that the logged-in user is a registered merchant (merchant_parents).
 * Supports lookup by email (password or email OTP) or by supabase_user_id (phone OTP).
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

export interface MerchantValidationResult {
  isValid: boolean;
  error?: string;
  merchantParentId?: number;
  parentMerchantId?: string;
  email?: string;
  /** When valid, parent status for UI (blocked/suspended banner, disable child registration). */
  approvalStatus?: string;
  registrationStatus?: string;
  isActive?: boolean;
}

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type ParentRow = {
  id: number;
  parent_merchant_id: string;
  owner_email?: string | null;
  is_active?: boolean | null;
  approval_status?: string | null;
  registration_status?: string | null;
  supabase_user_id?: string | null;
  registered_phone?: string | null;
  registered_phone_normalized?: string | null;
};

/** Returns user-facing message if parent is blocked/suspended; otherwise null. */
function getParentBlockReason(row: {
  is_active?: boolean | null;
  registration_status?: string | null;
  approval_status?: string | null;
}): string | null {
  if (row.is_active === false) {
    return "Your merchant account is inactive. Please contact support.";
  }
  if (row.registration_status === "SUSPENDED") {
    return "Your merchant account has been suspended. You cannot register new stores. Please contact support.";
  }
  const blockedApproval = ["BLOCKED", "SUSPENDED"].includes(
    String(row.approval_status || "").toUpperCase()
  );
  if (blockedApproval) {
    return "Your merchant account has been blocked. You cannot register new stores. Please contact support.";
  }
  return null;
}

function toValidationResult(row: ParentRow): MerchantValidationResult {
  const blockReason = getParentBlockReason(row);
  if (blockReason) {
    return {
      isValid: false,
      error: blockReason,
      merchantParentId: row.id,
      parentMerchantId: row.parent_merchant_id,
    };
  }
  return {
    isValid: true,
    merchantParentId: row.id,
    parentMerchantId: row.parent_merchant_id,
    email: row.owner_email ?? undefined,
    approvalStatus: row.approval_status ?? undefined,
    registrationStatus: row.registration_status ?? undefined,
    isActive: row.is_active ?? undefined,
  };
}

/** If parent has no supabase_user_id yet, attach this session so later lookups resolve by id. */
async function maybeLinkSupabaseUserId(parentId: number, supabaseUserId: string | undefined | null) {
  const uid = String(supabaseUserId || "").trim();
  if (!uid || !Number.isFinite(parentId) || parentId < 1) return;
  try {
    const supabase = getSupabaseAdmin();
    await supabase
      .from("merchant_parents")
      .update({ supabase_user_id: uid })
      .eq("id", parentId)
      .is("supabase_user_id", null);
  } catch (e) {
    console.warn("[maybeLinkSupabaseUserId] skipped:", e);
  }
}

/** Normalize phone: E.164 (+919876543210) and 10-digit (9876543210) for DB lookup. */
function normalizePhoneForLookup(phone: string): { e164: string; tenDigit: string } {
  const digits = phone.replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  const tenDigit = ten.length === 10 ? ten : "";
  const e164 = tenDigit ? `+91${tenDigit}` : phone.startsWith("+") ? phone : "";
  return { e164, tenDigit };
}

function sessionOwnsParent(
  parent: ParentRow,
  user: { id?: string | null; email?: string | null; phone?: string | null }
): boolean {
  const uid = String(user.id || "").trim();
  const email = String(user.email || "").trim().toLowerCase();
  const ownsByUserId =
    !!uid && !!parent.supabase_user_id && String(parent.supabase_user_id) === uid;
  const ownsByEmail =
    !!email &&
    !!parent.owner_email &&
    String(parent.owner_email).trim().toLowerCase() === email;

  if (ownsByUserId || ownsByEmail) return true;

  const phone = String(user.phone || "").trim();
  if (!phone) return false;
  const { e164, tenDigit } = normalizePhoneForLookup(phone);
  if (!tenDigit) return false;
  const parentE164 = String(parent.registered_phone || "").trim();
  const parentTen = String(parent.registered_phone_normalized || "").replace(/\D/g, "").slice(-10);
  if (parentE164 && (parentE164 === e164 || parentE164.replace(/\D/g, "").slice(-10) === tenDigit)) {
    return true;
  }
  if (parentTen && parentTen === tenDigit) return true;
  return false;
}

/** Validate merchant by Supabase Auth user id (e.g. after phone OTP login). */
export async function validateMerchantBySupabaseUserId(
  supabaseUserId: string
): Promise<MerchantValidationResult> {
  if (!supabaseUserId?.trim()) {
    return { isValid: false, error: "User id is required." };
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data: rows, error } = await supabase
      .from("merchant_parents")
      .select("id, parent_merchant_id, owner_email, is_active, approval_status, registration_status, supabase_user_id")
      .eq("supabase_user_id", supabaseUserId.trim())
      .order("id", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[validateMerchantBySupabaseUserId] DB error:", error);
      return { isValid: false, error: "Unable to verify your account. Please try again." };
    }
    const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as ParentRow) : null;
    if (!row) {
      return {
        isValid: false,
        error: "No merchant account found for this login. Please register first.",
      };
    }
    return toValidationResult(row);
  } catch (e) {
    console.error("[validateMerchantBySupabaseUserId] Error:", e);
    return { isValid: false, error: "An error occurred during validation. Please try again." };
  }
}

/** Validate merchant by phone (e.g. after phone OTP login). */
export async function validateMerchantByPhone(phone: string): Promise<MerchantValidationResult> {
  if (!phone?.trim()) {
    return { isValid: false, error: "Phone is required." };
  }
  try {
    const { e164, tenDigit } = normalizePhoneForLookup(phone.trim());
    if (!tenDigit) {
      return { isValid: false, error: "Invalid phone number." };
    }
    const supabase = getSupabaseAdmin();
    const { data: rows, error } = await supabase
      .from("merchant_parents")
      .select(
        "id, parent_merchant_id, owner_email, is_active, approval_status, registration_status, registered_phone, registered_phone_normalized, supabase_user_id"
      )
      .or(
        [
          `registered_phone.eq.${e164}`,
          `registered_phone.eq.${tenDigit}`,
          `registered_phone_normalized.eq.${tenDigit}`,
          `registered_phone_normalized.eq.${e164}`,
        ].join(",")
      )
      .order("id", { ascending: false })
      .limit(2);

    if (error) {
      console.error("[validateMerchantByPhone] DB error:", error);
      return { isValid: false, error: "Unable to verify your account. Please try again." };
    }
    const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as ParentRow) : null;
    if (!row) {
      return {
        isValid: false,
        error: "No merchant account found for this mobile number. Please register first.",
      };
    }
    if (Array.isArray(rows) && rows.length > 1) {
      console.warn(
        "[validateMerchantByPhone] Multiple merchant_parents for same phone:",
        tenDigit,
        "using newest id=",
        row.id
      );
    }
    return toValidationResult(row);
  } catch (e) {
    console.error("[validateMerchantByPhone] Error:", e);
    return { isValid: false, error: "An error occurred during validation. Please try again." };
  }
}

/** Validate merchant by email (password, email OTP, or Google OAuth). Case-insensitive match. */
export async function validateMerchantForLogin(email: string): Promise<MerchantValidationResult> {
  if (!email?.trim()) {
    return { isValid: false, error: "Email is required." };
  }
  try {
    const supabase = getSupabaseAdmin();
    const normalized = email.trim().toLowerCase();
    // Prefer newest parent when the same email registered more than once
    const { data: rows, error } = await supabase
      .from("merchant_parents")
      .select("id, parent_merchant_id, owner_email, is_active, approval_status, registration_status, supabase_user_id")
      .ilike("owner_email", normalized)
      .order("id", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[validateMerchantForLogin] DB error:", error);
      return { isValid: false, error: "Unable to verify your account. Please try again." };
    }
    const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as ParentRow) : null;
    if (!row) {
      return {
        isValid: false,
        error: "No merchant account found for this email. Please register first.",
      };
    }
    return toValidationResult(row);
  } catch (e) {
    console.error("[validateMerchantForLogin] Error:", e);
    return { isValid: false, error: "An error occurred during validation. Please try again." };
  }
}

/**
 * Validate merchant from session user.
 * supabase_user_id is authoritative for the active session — try it before phone/email
 * so a stale or shared phone number cannot resolve to a different merchant_parents row.
 */
export async function validateMerchantFromSession(user: {
  id: string;
  email?: string | null;
  phone?: string | null;
}): Promise<MerchantValidationResult> {
  const hasId = !!user.id?.trim();
  const hasEmail = !!user.email?.trim();
  const hasPhone = !!user.phone?.trim();

  if (hasId) {
    const byId = await validateMerchantBySupabaseUserId(user.id);
    if (byId.isValid) return byId;
    // Blocked/suspended parent linked to this auth user — don't fall through to another parent.
    if (byId.merchantParentId != null && byId.error) return byId;
  }
  if (hasEmail && user.email) {
    const byEmail = await validateMerchantForLogin(user.email);
    if (byEmail.isValid) {
      if (byEmail.merchantParentId != null) {
        await maybeLinkSupabaseUserId(byEmail.merchantParentId, user.id);
      }
      return byEmail;
    }
    if (byEmail.merchantParentId != null && byEmail.error) return byEmail;
  }
  if (hasPhone && user.phone) {
    const byPhone = await validateMerchantByPhone(user.phone);
    if (byPhone.isValid) {
      if (byPhone.merchantParentId != null) {
        await maybeLinkSupabaseUserId(byPhone.merchantParentId, user.id);
      }
      return byPhone;
    }
    if (byPhone.merchantParentId != null && byPhone.error) return byPhone;
  }

  return {
    isValid: false,
    error: "No merchant account found for this login. Please register first.",
  };
}

async function loadPreferredParent(preferred: string | number): Promise<ParentRow | null> {
  const supabase = getSupabaseAdmin();
  const asNum =
    typeof preferred === "number"
      ? preferred
      : /^\d+$/.test(String(preferred).trim())
        ? Number(String(preferred).trim())
        : NaN;

  if (Number.isFinite(asNum) && asNum > 0) {
    const { data, error } = await supabase
      .from("merchant_parents")
      .select(
        "id, parent_merchant_id, owner_email, is_active, approval_status, registration_status, supabase_user_id, registered_phone, registered_phone_normalized"
      )
      .eq("id", Math.floor(asNum))
      .maybeSingle();
    if (!error && data) return data as ParentRow;
  }

  const publicId = String(preferred || "").trim();
  if (!publicId) return null;
  const { data, error } = await supabase
    .from("merchant_parents")
    .select(
      "id, parent_merchant_id, owner_email, is_active, approval_status, registration_status, supabase_user_id, registered_phone, registered_phone_normalized"
    )
    .eq("parent_merchant_id", publicId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ParentRow;
}

/**
 * Prefer an explicit parent_id from the register-store URL when the session user owns it
 * (same supabase_user_id, owner_email, or registered phone).
 * Tries the preferred parent even when default session resolution fails — important for
 * multi-parent emails / phone OTP before supabase_user_id is linked.
 */
export async function validateMerchantFromSessionPreferParent(
  user: {
    id: string;
    email?: string | null;
    phone?: string | null;
  },
  preferredParentId?: number | string | null
): Promise<MerchantValidationResult> {
  const preferredRaw =
    preferredParentId == null || preferredParentId === ""
      ? null
      : typeof preferredParentId === "number"
        ? Number.isFinite(preferredParentId) && preferredParentId > 0
          ? preferredParentId
          : null
        : String(preferredParentId).trim() || null;

  if (preferredRaw != null) {
    try {
      const parent = await loadPreferredParent(preferredRaw);
      if (parent && sessionOwnsParent(parent, user)) {
        const result = toValidationResult(parent);
        if (result.isValid && result.merchantParentId != null) {
          await maybeLinkSupabaseUserId(result.merchantParentId, user.id);
        }
        return result;
      }
    } catch (e) {
      console.error("[validateMerchantFromSessionPreferParent] preferred lookup error:", e);
    }
  }

  const base = await validateMerchantFromSession(user);
  const preferredMatchesBase =
    preferredRaw == null ||
    preferredRaw === base.merchantParentId ||
    String(preferredRaw) === String(base.merchantParentId ?? "") ||
    String(preferredRaw) === String(base.parentMerchantId ?? "");
  if (!base.isValid || preferredMatchesBase) {
    return base;
  }

  // Preferred differed from default session parent — switch only if session owns preferred.
  try {
    const parent = await loadPreferredParent(preferredRaw);
    if (!parent || !sessionOwnsParent(parent, user)) return base;
    const result = toValidationResult(parent);
    if (result.isValid && result.merchantParentId != null) {
      await maybeLinkSupabaseUserId(result.merchantParentId, user.id);
    }
    return result;
  } catch (e) {
    console.error("[validateMerchantFromSessionPreferParent] Error:", e);
    return base;
  }
}
