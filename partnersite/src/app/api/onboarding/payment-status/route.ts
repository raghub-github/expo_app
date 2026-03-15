import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/onboarding/payment-status
 * - ?orderId=order_xxx → status for this Razorpay order (for polling after payment; e.g. page refresh). Returns status, alreadyPaid, capturedAt.
 * - ?merchantParentId=123&merchantStoreId=GMMC1001 → whether this store has completed onboarding payment (by store).
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: "Server misconfiguration" },
        { status: 500 }
      );
    }
    const orderId = request.nextUrl.searchParams.get("orderId");
    const db = getSupabaseAdmin();

    // By orderId: for polling when user may have paid but page was closed/refreshed
    if (orderId?.trim()) {
      const { data: row, error } = await db
        .from("merchant_onboarding_payments")
        .select("id, status, captured_at")
        .eq("razorpay_order_id", orderId.trim())
        .maybeSingle();
      if (error) {
        console.error("[onboarding/payment-status] Error:", error);
        return NextResponse.json(
          { success: false, error: "Failed to check payment status" },
          { status: 500 }
        );
      }
      const captured = row?.status === "captured";
      return NextResponse.json({
        success: true,
        orderId: orderId.trim(),
        status: row?.status ?? "unknown",
        alreadyPaid: captured,
        capturedAt: row?.captured_at ?? null,
        checkedBy: "order_id",
      });
    }

    const merchantParentId = request.nextUrl.searchParams.get("merchantParentId");
    const merchantStoreId = request.nextUrl.searchParams.get("merchantStoreId"); // Store public ID (e.g., GMMC1001)

    if (!merchantParentId) {
      return NextResponse.json(
        { success: false, error: "merchantParentId or orderId is required" },
        { status: 400 }
      );
    }
    const parentId = Number(merchantParentId);
    if (!Number.isFinite(parentId)) {
      return NextResponse.json(
        { success: false, error: "Invalid merchantParentId" },
        { status: 400 }
      );
    }

    // Payment status is checked by store_id only (merchant_store_id in merchant_onboarding_payments).
    if (!merchantStoreId || !merchantStoreId.trim()) {
      return NextResponse.json({
        success: true,
        alreadyPaid: false,
        capturedAt: null,
        checkedBy: "store_id",
        message: "Store ID is required to check payment; no store ID provided.",
      });
    }

    // Resolve public store_id to numeric id and check payment for this store only
    const { data: storeRow } = await db
      .from("merchant_stores")
      .select("id")
      .eq("store_id", merchantStoreId.trim())
      .eq("parent_id", parentId)
      .maybeSingle();

    if (!storeRow?.id) {
      return NextResponse.json({
        success: true,
        alreadyPaid: false,
        capturedAt: null,
        checkedBy: "store_id",
        message: "Store not found; payment required for this store.",
      });
    }

    const { data, error } = await db
      .from("merchant_onboarding_payments")
      .select("id, status, captured_at")
      .eq("merchant_store_id", storeRow.id)
      .eq("status", "captured")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[onboarding/payment-status] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to check payment status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      alreadyPaid: !!data,
      capturedAt: data?.captured_at ?? null,
      checkedBy: "store_id",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("[onboarding/payment-status] Error:", e);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
