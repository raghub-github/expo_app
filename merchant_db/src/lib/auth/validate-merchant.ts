/**
 * Validate that the logged-in user is a registered merchant (merchant_parents).
 * Supports lookup by email (password or email OTP) or by supabase_user_id (phone OTP).
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

/** Validate merchant by Supabase Auth user id (e.g. after phone OTP login). */
export async function validateMerchantBySupabaseUserId(
  supabaseUserId: string
): Promise<MerchantValidationResult> {
  if (!supabaseUserId?.trim()) {
    return { isValid: false, error: "User id is required." };
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data: row, error } = await supabase
      .from("merchant_parents")
      .select("id, parent_merchant_id, owner_email, is_active, approval_status, registration_status, supabase_user_id")
      .eq("supabase_user_id", supabaseUserId.trim())
      .maybeSingle();

    if (error) {
      console.error("[validateMerchantBySupabaseUserId] DB error:", error);
      return { isValid: false, error: "Unable to verify your account. Please try again." };
    }
    if (!row) {
      return {
        isValid: false,
        error: "No merchant account found for this login. Please register first.",
      };
    }
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
      approvalStatus: (row as any).approval_status,
      registrationStatus: (row as any).registration_status,
      isActive: row.is_active,
    };
  } catch (e) {
    console.error("[validateMerchantBySupabaseUserId] Error:", e);
    return { isValid: false, error: "An error occurred during validation. Please try again." };
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
    // DB: registered_phone is +91..., registered_phone_normalized is 10 digits
    const { data: row, error } = await supabase
      .from("merchant_parents")
      .select("id, parent_merchant_id, owner_email, is_active, approval_status, registration_status, registered_phone")
      .or(`registered_phone.eq.${e164},registered_phone_normalized.eq.${tenDigit}`)
      .maybeSingle();

    if (error) {
      console.error("[validateMerchantByPhone] DB error:", error);
      return { isValid: false, error: "Unable to verify your account. Please try again." };
    }
    if (!row) {
      return {
        isValid: false,
        error: "No merchant account found for this mobile number. Please register first.",
      };
    }
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
      approvalStatus: (row as any).approval_status,
      registrationStatus: (row as any).registration_status,
      isActive: row.is_active,
    };
  } catch (e) {
    console.error("[validateMerchantByPhone] Error:", e);
    return { isValid: false, error: "An error occurred during validation. Please try again." };
  }
}

/** Validate merchant by email (password or email OTP login). */
export async function validateMerchantForLogin(email: string): Promise<MerchantValidationResult> {
  if (!email?.trim()) {
    return { isValid: false, error: "Email is required." };
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data: row, error } = await supabase
      .from("merchant_parents")
      .select("id, parent_merchant_id, owner_email, is_active, approval_status, registration_status, supabase_user_id")
      .eq("owner_email", email.trim().toLowerCase())
      .maybeSingle();

    if (error) {
      console.error("[validateMerchantForLogin] DB error:", error);
      return { isValid: false, error: "Unable to verify your account. Please try again." };
    }
    if (!row) {
      return {
        isValid: false,
        error: "No merchant account found for this email. Please register first.",
      };
    }
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
      approvalStatus: (row as any).approval_status,
      registrationStatus: (row as any).registration_status,
      isActive: row.is_active,
    };
  } catch (e) {
    console.error("[validateMerchantForLogin] Error:", e);
    return { isValid: false, error: "An error occurred during validation. Please try again." };
  }
}

/**
 * Validate merchant from session user: by email, then phone, then supabase_user_id.
 * Use this after Google (email), phone OTP (phone or id), or password login.
 */
export async function validateMerchantFromSession(user: {
  id: string;
  email?: string | null;
  phone?: string | null;
}): Promise<MerchantValidationResult> {
  if (user.email?.trim()) {
    return validateMerchantForLogin(user.email);
  }
  if (user.phone?.trim()) {
    return validateMerchantByPhone(user.phone);
  }
  if (user.id?.trim()) {
    return validateMerchantBySupabaseUserId(user.id);
  }
  return { isValid: false, error: "Unable to identify user. Please try again." };
}
