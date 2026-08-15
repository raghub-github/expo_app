import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { isNetworkOrTransientError } from "@/lib/auth/session-errors";
import { hasActiveSessionForDevice, replaceSessionForDevice, generateDeviceId, touchSessionLastSeen } from "@/lib/auth/merchant-session-db";
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
 * GET /api/merchant-auth/resolve-session
 * Requires valid Supabase session + device_id cookie (set by set-cookie after login).
 */
export async function GET() {
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
        await replaceSessionForDevice(deviceId, parentId, {
          loginMethod: "self_heal",
          deviceLabel: "Restored session",
        });
        hasDeviceSession = true;
        setDeviceCookieOnResponse = true;
      } catch (e) {
        console.error("[merchant-auth/resolve-session] repair session failed:", e);
        return NextResponse.json(
          { success: false, error: "Session expired or invalid for this device. Please sign in again.", code: "DEVICE_SESSION_INVALID" },
          { status: 401 }
        );
      }
    } else if (deviceId) {
      // Best-effort heartbeat for device list "last seen"
      void touchSessionLastSeen(deviceId, parentId);
    }

    const db = getSupabaseAdmin();

    const { data: parentRow } = await db
      .from("merchant_parents")
      .select("parent_name, owner_name, owner_email, parent_merchant_id, store_logo")
      .eq("id", parentId)
      .single();

    const { data: stores, error: storesError } = await db
      .from("merchant_stores")
      .select(
        "id, store_id, store_name, owner_full_name, full_address, store_phones, approval_status, delisted_at, is_active, current_onboarding_step, onboarding_completed, banner_url"
      )
      .eq("parent_id", parentId);

    if (storesError) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch stores" },
        { status: 500 }
      );
    }

    const storeIds = (stores ?? []).map((s) => s.id).filter((id): id is number => id != null);
    const paymentByStoreId: Record<number, "pending" | "completed"> = {};
    if (storeIds.length > 0) {
      const { data: payments } = await db
        .from("merchant_onboarding_payments")
        .select("merchant_store_id, status")
        .eq("merchant_parent_id", parentId)
        .in("merchant_store_id", storeIds)
        .eq("status", "captured");
      for (const p of payments ?? []) {
        const sid = p.merchant_store_id as number | null;
        if (sid != null) paymentByStoreId[sid] = "completed";
      }
      for (const sid of storeIds) {
        if (!paymentByStoreId[sid]) paymentByStoreId[sid] = "pending";
      }
    }

    const rejectionByStore =
      storeIds.length > 0 ? await fetchVerificationRejectionsByStoreIds(db, storeIds) : {};

    const storesMutable = [...(stores ?? [])];
    for (const store of storesMutable) {
      if (!store.id || store.onboarding_completed === true) continue;
      const storeDelistedAt = (store as { delisted_at?: string | null }).delisted_at;
      if (storeDelistedAt != null && String(storeDelistedAt).trim() !== "") continue;
      if (String(store.approval_status || "").toUpperCase() === "DELISTED") continue;
      const { data: completedProgress } = await db
        .from("merchant_store_registration_progress")
        .select("completed_at")
        .eq("store_id", store.id)
        .eq("registration_status", "COMPLETED")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const hasCompletedProgress = !!completedProgress;
      let hasAgreement = false;
      if (!hasCompletedProgress) {
        const { data: agreementRow } = await db
          .from("merchant_store_agreement_acceptances")
          .select("id")
          .eq("store_id", store.id)
          .limit(1)
          .maybeSingle();
        hasAgreement = !!agreementRow;
      }
      if (!hasCompletedProgress && !hasAgreement) continue;

      const repairApproval =
        String(store.approval_status || "").toUpperCase() === "DRAFT" ? "SUBMITTED" : store.approval_status;
      const repairedAt = completedProgress?.completed_at || new Date().toISOString();
      await db
        .from("merchant_stores")
        .update({
          onboarding_completed: true,
          onboarding_completed_at: repairedAt,
          approval_status: repairApproval,
          current_onboarding_step: 9,
          updated_at: new Date().toISOString(),
        })
        .eq("id", store.id);
      store.onboarding_completed = true;
      store.approval_status = repairApproval;
      store.current_onboarding_step = 9;
    }

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

    const storeList = storesMutable.map((s) => ({
      ...s,
      payment_status: (s.id != null ? (paymentByStoreId[s.id] ?? "pending") : "pending") as "pending" | "completed",
      verification_step_rejections:
        s.id != null ? (rejectionByStore[s.id] ?? []) : [],
    }));
    const verifiedStores = storeList.filter((s) => s.approval_status === "APPROVED");
    const hasDraftStore = storeList.some((s) => (s.approval_status || "").toUpperCase() === "DRAFT");
    const hasIncompleteStore = storeList.some((s) => {
      if (s.onboarding_completed === true) return false;
      const approval = String(s.approval_status || "").toUpperCase();
      if (["SUBMITTED", "UNDER_VERIFICATION", "PENDING_VERIFICATION", "APPROVED"].includes(approval)) {
        return false;
      }
      const step = s.current_onboarding_step;
      return typeof step === "number" && step < 9;
    });
    const progressStep = progress?.current_step != null ? Number(progress.current_step) : null;
    const progressIncomplete = progressStep != null && progressStep < 9;
    const showDraftBanner = progress && !progress?.store_id && (hasDraftStore || hasIncompleteStore || progressIncomplete);
    const onboardingProgress = showDraftBanner ? progress : null;

    const body = {
      success: true,
      parentId,
      parentMerchantId: validation.parentMerchantId,
      parentName: parentRow?.parent_name ?? null,
      ownerName: parentRow?.owner_name ?? null,
      ownerEmail: parentRow?.owner_email ?? null,
      parentLogo: parentRow?.store_logo ?? null,
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
    console.error("[merchant-auth/resolve-session] Error:", e);
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
