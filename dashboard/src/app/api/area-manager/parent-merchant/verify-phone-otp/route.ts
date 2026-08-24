/**
 * POST /api/area-manager/parent-merchant/verify-phone-otp
 * Verify SMS OTP for Register Parent (anon client — does not replace AM session).
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
    const token = typeof body?.code === "string" ? body.code.replace(/\s/g, "").trim() : "";

    if (!phone) {
      return NextResponse.json({ error: "Enter a valid 10-digit mobile number" }, { status: 400 });
    }
    if (!token || token.length < 6) {
      return NextResponse.json({ error: "Enter the verification code from SMS" }, { status: 400 });
    }

    const anon = createIsolatedOtpClient();
    if (!anon) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }
    const { data, error } = await anon.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });

    if (error) {
      const msg = error.message || "Invalid or expired code.";
      return NextResponse.json(
        {
          error:
            msg.includes("expired") || msg.includes("invalid")
              ? "The verification code has expired or is invalid. Request a new code."
              : msg,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      verifiedPhone: phone,
      supabase_user_id: data?.user?.id ?? null,
    });
  } catch (e) {
    console.error("[POST /api/area-manager/parent-merchant/verify-phone-otp]", e);
    const { body, status } = apiErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
