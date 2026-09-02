import { NextRequest, NextResponse } from "next/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getMerchantStoreByIdOnly } from "@/lib/db/operations/merchant-stores";
import {
  getMerchantOnboardingPaymentByOrderId,
  getMerchantOnboardingPaymentCaptured,
} from "@/lib/merchant-onboarding-payment";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAreaManagerApiAuth(undefined, req);
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const orderId = req.nextUrl.searchParams.get("orderId")?.trim();
    const storeInternalId = Number(req.nextUrl.searchParams.get("storeInternalId"));

    if (orderId) {
      const row = await getMerchantOnboardingPaymentByOrderId(orderId);
      const captured = row?.status === "captured";
      return NextResponse.json({
        success: true,
        orderId,
        status: row?.status ?? "unknown",
        alreadyPaid: captured,
        capturedAt: row?.captured_at ?? null,
        checkedBy: "order_id",
      });
    }

    if (!Number.isFinite(storeInternalId)) {
      return NextResponse.json(
        { success: false, error: "storeInternalId is required" },
        { status: 400 }
      );
    }

    const store = await getMerchantStoreByIdOnly(storeInternalId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const alreadyPaid = await getMerchantOnboardingPaymentCaptured(
      store.parent_id,
      storeInternalId
    );
    return NextResponse.json({
      success: true,
      alreadyPaid,
      capturedAt: null,
      checkedBy: "store_id",
    });
  } catch (e) {
    console.error("[area-manager/merchant-onboarding/payment-status]", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
