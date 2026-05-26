import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { isNetworkOrTransientError } from "@/lib/auth/session-errors";
import { hasActiveSessionForDevice, replaceSessionForDevice, generateDeviceId } from "@/lib/auth/merchant-session-db";
import { deviceIdCookie } from "@/lib/auth/auth-cookie-names";
import { createClient } from "@supabase/supabase-js";
import { fetchVerificationRejectionsByStoreIds } from "@/lib/onboarding/partner-verification-rejections";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/auth/resolve-session
 * Requires valid session. Returns parent, child stores, and onboarding progress
 * so the client can redirect: no children → register-store; in progress → resume; has verified → dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      if (userError && isNetworkOrTransientError(userError)) {
        return NextResponse.json(
          { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        );
      }
      if (userError) {
        console.warn("[resolve-session] getUser error (401):", userError.message);
      } else {
        console.warn("[resolve-session] No user in session (401)");
      }
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });

    if (!validation.isValid || validation.merchantParentId == null) {
      console.warn("[resolve-session] Merchant validation failed (403):", validation.error, "user id:", user.id);
      return NextResponse.json(
        { success: false, error: validation.error ?? "Merchant not found", code: "MERCHANT_NOT_FOUND" },
        { status: 403 }
      );
    }

    const parentId = validation.merchantParentId;
    const cookieStore = await cookies();
    let deviceId = cookieStore.get(deviceIdCookie())?.value?.trim();
    let hasDeviceSession = deviceId
      ? await hasActiveSessionForDevice(parentId, deviceId)
      : false;
    let setDeviceCookieOnResponse = false;
    if (!hasDeviceSession) {
      try {
        deviceId = deviceId || generateDeviceId();
        await replaceSessionForDevice(deviceId, parentId);
        hasDeviceSession = true;
        setDeviceCookieOnResponse = true;
      } catch (e) {
        console.warn("[resolve-session] No active device session (401):", "merchant_id:", parentId, "device_id:", deviceId ? "present" : "missing");
        return NextResponse.json(
          { success: false, error: "Session expired or invalid for this device. Please sign in again.", code: "DEVICE_SESSION_INVALID" },
          { status: 401 }
        );
      }
    }

    const db = getSupabaseAdmin();

    const { data: parentRow } = await db
      .from("merchant_parents")
      .select("parent_name, owner_name, owner_email, parent_merchant_id")
      .eq("id", parentId)
      .single();

    const { data: stores, error: storesError } = await db
      .from("merchant_stores")
      .select("id, store_id, store_name, full_address, store_phones, approval_status, is_active, current_onboarding_step, onboarding_completed")
      .eq("parent_id", parentId);

    if (storesError) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch stores" },
        { status: 500 }
      );
    }

    // Check payment status by store_id (each store has its own payment record)
    const storeIds = (stores ?? []).map((s) => s.id).filter((id): id is number => id != null);
    let paymentByStoreId: Record<number, "pending" | "completed"> = {};
    
    if (storeIds.length > 0) {
      // Check payment status for each store individually
      const { data: payments } = await db
        .from("merchant_onboarding_payments")
        .select("merchant_store_id, status")
        .eq("merchant_parent_id", parentId)
        .in("merchant_store_id", storeIds)
        .eq("status", "captured");
      
      // Mark stores with captured payments as completed
      for (const p of payments ?? []) {
        const sid = p.merchant_store_id as number | null;
        if (sid != null) {
          paymentByStoreId[sid] = "completed";
        }
      }
      
      // All other stores default to pending
      for (const sid of storeIds) {
        if (!paymentByStoreId[sid]) {
          paymentByStoreId[sid] = "pending";
        }
      }
    }

    const rejectionByStore =
      storeIds.length > 0 ? await fetchVerificationRejectionsByStoreIds(db, storeIds) : {};

    const { data: progress, error: progressError } = await db
      .from("merchant_store_registration_progress")
      .select("*")
      .eq("parent_id", parentId)
      .is("store_id", null)
      .neq("registration_status", "COMPLETED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (progressError) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch onboarding progress" },
        { status: 500 }
      );
    }

    const storeList = (stores ?? []).map((s) => ({
      ...s,
      payment_status: (s.id != null ? (paymentByStoreId[s.id] ?? "pending") : "pending") as "pending" | "completed",
      verification_step_rejections:
        s.id != null ? (rejectionByStore[s.id] ?? []) : [],
    }));
    const verifiedStores = storeList.filter((s) => s.approval_status === "APPROVED");
    // Only treat as "incomplete draft" when there is real unfinished work. Do not show "Resume draft"
    // when all stores are SUBMITTED/APPROVED/REJECTED (stale progress row with store_id null).
    const hasDraftStore = storeList.some((s) => (s.approval_status || "").toUpperCase() === "DRAFT");
    const hasIncompleteStore = storeList.some((s) => {
      const step = s.current_onboarding_step;
      return typeof step === "number" && step < 9;
    });
    const progressStep = progress?.current_step != null ? Number(progress.current_step) : null;
    const progressIncomplete = progressStep != null && progressStep < 9;
    // Show banner only if: (1) there's a progress row with store_id=null, AND
    // (2) either there's a DRAFT store OR there's a store with step < 9 OR the progress row itself has step < 9
    const showDraftBanner = progress && !progress?.store_id && (hasDraftStore || hasIncompleteStore || progressIncomplete);
    const onboardingProgress = showDraftBanner ? progress : null;

    const body = {
      success: true,
      parentId,
      parentMerchantId: validation.parentMerchantId,
      parentName: parentRow?.parent_name ?? null,
      ownerName: parentRow?.owner_name ?? null,
      ownerEmail: parentRow?.owner_email ?? null,
      stores: storeList,
      onboardingProgress,
      hasVerifiedStore: verifiedStores.length > 0,
      verifiedStores,
    };
    const response = NextResponse.json(body);
    if (setDeviceCookieOnResponse && deviceId) {
      response.cookies.set(deviceIdCookie(), deviceId, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 365 * 24 * 60 * 60,
      });
    }
    return response;
  } catch (e) {
    console.error("[resolve-session] Error:", e);
    if (isNetworkOrTransientError(e)) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: "An error occurred" },
      { status: 500 }
    );
  }
}
