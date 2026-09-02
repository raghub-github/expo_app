import { NextRequest, NextResponse } from "next/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getMerchantStoreByIdOnly } from "@/lib/db/operations/merchant-stores";
import {
  createMerchantOnboardingOrder,
  getMerchantOnboardingPaymentCaptured,
} from "@/lib/merchant-onboarding-payment";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAreaManagerApiAuth(undefined, req);
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const body = await req.json().catch(() => ({}));
    const storeInternalId = Number(body.storeInternalId ?? body.merchantStoreInternalId);

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

    const effectiveParentId = store.parent_id;
    const effectiveStorePublicId = store.store_id;

    const alreadyPaid = await getMerchantOnboardingPaymentCaptured(
      effectiveParentId,
      storeInternalId
    );
    if (alreadyPaid) {
      return NextResponse.json({ success: true, alreadyPaid: true });
    }

    const result = await createMerchantOnboardingOrder({
      merchantParentId: effectiveParentId,
      merchantStoreInternalId: storeInternalId,
      merchantStorePublicId: effectiveStorePublicId,
      planId: typeof body.planId === "string" ? body.planId : "FREE",
      planName: typeof body.planName === "string" ? body.planName : undefined,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error, code: result.code },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      keyId: result.keyId,
      amount: result.amountPaise,
      subtotalPaise: result.subtotalPaise,
      gstAmountPaise: result.gstAmountPaise,
      gstPercentApplied: result.gstPercentApplied,
      qrImageUrl: result.qrImageUrl,
      qrId: result.qrId,
      storePublicId: effectiveStorePublicId,
      currency: "INR",
    });
  } catch (e) {
    console.error("[area-manager/merchant-onboarding/create-order]", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
