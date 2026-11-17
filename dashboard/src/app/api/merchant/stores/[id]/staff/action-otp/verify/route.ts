import { NextRequest, NextResponse } from "next/server";
import { assertDashboardStoreStaffAccess } from "@/lib/merchant/assert-store-staff-access";
import {
  verifyMerchantActionOtp,
  type MerchantActionOtpPurpose,
} from "@/lib/merchant-action-otp";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await assertDashboardStoreStaffAccess(id);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      requestId?: string;
      otp?: string;
      purpose?: MerchantActionOtpPurpose;
    };
    const requestId = String(body.requestId ?? "").trim();
    const otp = String(body.otp ?? "").trim();
    if (requestId.length < 6 || otp.length < 4) {
      return NextResponse.json(
        { success: false, error: "invalid_otp", message: "Invalid OTP payload" },
        { status: 400 }
      );
    }

    const result = verifyMerchantActionOtp({
      userId: access.userId,
      requestId,
      otp,
      purpose: body.purpose,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: "invalid_otp", message: result.reason },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[dashboard staff otp verify]", e);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
