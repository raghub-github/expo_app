/**
 * POST /api/area-manager/parent-merchant/send-phone-otp
 * Send SMS OTP for Register Parent (anon client — does not replace AM session).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { apiErrorResponse } from "@/lib/api-errors";
import { createIsolatedOtpClient } from "@/lib/supabase/isolated-otp-client";

export const runtime = "nodejs";

function normalizePhoneE164(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) return null;
  return `+91${ten}`;
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAreaManagerApiAuth();
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const body = await req.json();
    const phone = normalizePhoneE164(typeof body?.phone === "string" ? body.phone : "");
    if (!phone) {
      return NextResponse.json({ error: "Enter a valid 10-digit mobile number" }, { status: 400 });
    }

    const anon = createIsolatedOtpClient();
    if (!anon) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }
    const { error } = await anon.auth.signInWithOtp({
      phone,
      options: { channel: "sms" },
    });

    if (error) {
      const msg = error.message || "Failed to send OTP";
      if (
        /provider|sms|422|unprocessable|not configured/i.test(msg)
      ) {
        return NextResponse.json(
          {
            error:
              "SMS is not configured. Configure an SMS provider in Supabase, or disable phone OTP (NEXT_PUBLIC_ENABLE_PHONE_OTP_REGISTER).",
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ success: true, phone });
  } catch (e) {
    console.error("[POST /api/area-manager/parent-merchant/send-phone-otp]", e);
    const { body, status } = apiErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
