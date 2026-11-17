import { NextRequest, NextResponse } from "next/server";
import { assertStaffManageAccess } from "@/lib/staff/assert-staff-manage";
import {
  verifyMerchantActionOtp,
  type MerchantActionOtpPurpose,
} from "@/lib/staff/merchant-action-otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/merchant/staff/action-otp/verify?storeId= — body: { requestId, otp, purpose? } */
export async function POST(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId");
    const access = await assertStaffManageAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      requestId?: string;
      otp?: string;
      purpose?: MerchantActionOtpPurpose;
    };
    const requestId = String(body.requestId ?? "").trim();
    const otp = String(body.otp ?? "").trim();
    if (requestId.length < 6 || otp.length < 4) {
      return NextResponse.json({ error: "invalid_otp", message: "Invalid OTP payload" }, { status: 400 });
    }

    const result = await verifyMerchantActionOtp({
      userId: access.userId,
      requestId,
      otp: String(body.otp ?? "").replace(/\D/g, "").trim(),
      purpose: body.purpose,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "invalid_otp", message: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[staff/action-otp/verify]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
