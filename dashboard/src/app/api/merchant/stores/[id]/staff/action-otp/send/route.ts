import { NextRequest, NextResponse } from "next/server";
import {
  assertDashboardStoreStaffAccess,
  toE164In,
} from "@/lib/merchant/assert-store-staff-access";
import {
  sendMerchantActionOtp,
  type MerchantActionOtpPurpose,
} from "@/lib/merchant-action-otp";

export const runtime = "nodejs";

const PURPOSES: MerchantActionOtpPurpose[] = [
  "invite",
  "remove_staff",
  "logout_device",
  "logout_all",
];

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

    const body = (await req.json().catch(() => ({}))) as { purpose?: string };
    const purpose = String(body.purpose ?? "").trim() as MerchantActionOtpPurpose;
    if (!PURPOSES.includes(purpose)) {
      return NextResponse.json({ success: false, error: "Invalid purpose" }, { status: 400 });
    }

    const registered = String(access.owner.registered_phone ?? "").trim();
    if (!registered) {
      return NextResponse.json(
        {
          success: false,
          error: "phone_missing",
          message: "Owner phone is required to send OTP.",
        },
        { status: 400 }
      );
    }

    try {
      const sent = await sendMerchantActionOtp({
        userId: access.userId,
        purpose,
        phoneE164: toE164In(registered),
        email: access.owner.owner_email,
      });
      return NextResponse.json({ success: true, ...sent });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      return NextResponse.json(
        { success: false, error: "otp_send_failed", message: err.message || "Could not send OTP" },
        { status: typeof err.statusCode === "number" ? err.statusCode : 500 }
      );
    }
  } catch (e) {
    console.error("[dashboard staff otp send]", e);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
