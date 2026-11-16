import { NextRequest, NextResponse } from "next/server";
import { assertStaffManageAccess, toE164In } from "@/lib/staff/assert-staff-manage";
import {
  sendMerchantActionOtp,
  type MerchantActionOtpPurpose,
} from "@/lib/staff/merchant-action-otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PURPOSES: MerchantActionOtpPurpose[] = [
  "invite",
  "remove_staff",
  "logout_device",
  "logout_all",
];

/** POST /api/merchant/staff/action-otp/send?storeId= — body: { purpose } */
export async function POST(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId");
    const access = await assertStaffManageAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = (await req.json().catch(() => ({}))) as { purpose?: string };
    const purpose = String(body.purpose ?? "").trim() as MerchantActionOtpPurpose;
    if (!PURPOSES.includes(purpose)) {
      return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
    }

    const registered = String(access.owner.registered_phone ?? "").trim();
    if (!registered) {
      return NextResponse.json(
        {
          error: "phone_missing",
          message: "Owner phone is required to send OTP. Update owner contact details and try again.",
        },
        { status: 400 }
      );
    }

    const phoneE164 = toE164In(registered);
    const email = access.owner.owner_email;

    try {
      const sent = await sendMerchantActionOtp({
        userId: access.userId,
        purpose,
        phoneE164,
        email,
      });
      return NextResponse.json(sent);
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      const status = typeof err.statusCode === "number" ? err.statusCode : 500;
      return NextResponse.json(
        { error: "otp_send_failed", message: err.message || "Could not send OTP." },
        { status }
      );
    }
  } catch (e) {
    console.error("[staff/action-otp/send]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
