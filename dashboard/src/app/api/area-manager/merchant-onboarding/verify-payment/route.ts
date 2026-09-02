import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAreaManagerApiAuth(undefined, req);
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    if (!razorpayKeySecret) {
      return NextResponse.json({ success: false, error: "Payment not configured" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = body.razorpay_order_id ?? body.orderId;
    const paymentId = body.razorpay_payment_id ?? body.paymentId;
    const signature = body.razorpay_signature ?? body.signature;
    if (!orderId || !paymentId || !signature) {
      return NextResponse.json(
        { success: false, error: "Missing order_id, payment_id or signature" },
        { status: 400 }
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    const sql = getSql();

    if (expectedSignature !== signature) {
      await sql`
        UPDATE merchant_onboarding_payments
        SET status = 'failed',
            failed_at = now(),
            failure_reason = 'Invalid signature',
            updated_at = now()
        WHERE razorpay_order_id = ${orderId}
      `;
      return NextResponse.json({ success: false, error: "Invalid payment signature" }, { status: 400 });
    }

    const rows = await sql<
      { id: number; merchant_parent_id: number; merchant_store_id: number | null }[]
    >`
      SELECT id, merchant_parent_id, merchant_store_id
      FROM merchant_onboarding_payments
      WHERE razorpay_order_id = ${orderId}
      LIMIT 1
    `;
    const existing = Array.isArray(rows) ? rows[0] : null;
    if (!existing) {
      return NextResponse.json({ success: false, error: "Payment order not found" }, { status: 404 });
    }

    let storeIdToUpdate = existing.merchant_store_id;
    if (!storeIdToUpdate) {
      const latest = await sql<{ id: number }[]>`
        SELECT id
        FROM merchant_stores
        WHERE parent_id = ${existing.merchant_parent_id}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      storeIdToUpdate = Array.isArray(latest) ? latest[0]?.id ?? null : null;
    }

    await sql`
      UPDATE merchant_onboarding_payments
      SET merchant_store_id = ${storeIdToUpdate},
          razorpay_payment_id = ${paymentId},
          razorpay_signature = ${signature},
          status = 'captured',
          razorpay_status = 'captured',
          captured_at = now(),
          updated_at = now()
      WHERE razorpay_order_id = ${orderId}
    `;

    return NextResponse.json({
      success: true,
      paymentRecordId: existing.id,
      merchantParentId: existing.merchant_parent_id,
    });
  } catch (e) {
    console.error("[area-manager/merchant-onboarding/verify-payment]", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
