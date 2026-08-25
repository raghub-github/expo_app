/**
 * POST /api/area-manager/parent-merchant/send-email-otp
 * Send email OTP for Register Parent using an anon client so the
 * area manager dashboard session is not replaced.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { apiErrorResponse } from "@/lib/api-errors";
import { isValidEmail, normalizeEmail } from "@/lib/valid-email";
import { createIsolatedOtpClient } from "@/lib/supabase/isolated-otp-client";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAreaManagerApiAuth();
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const body = await req.json();
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const anon = createIsolatedOtpClient();
    if (!anon) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }
    const { error } = await anon.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (error) {
      const msg = error.message || "Failed to send code";
      if (
        /rate limit|rate_limit|too many|exceeded/i.test(msg) ||
        (error as { code?: string; status?: number }).code === "429" ||
        (error as { status?: number }).status === 429
      ) {
        return NextResponse.json(
          { error: "EMAIL_RATE_LIMIT_EXCEEDED" },
          { status: 429 }
        );
      }
      if (/confirmation email|magic link|sending/i.test(msg)) {
        return NextResponse.json(
          {
            error:
              "Could not send verification email. Check SMTP in Supabase (Authentication > Email) or try again later.",
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ success: true, email });
  } catch (e) {
    console.error("[POST /api/area-manager/parent-merchant/send-email-otp]", e);
    const { body, status } = apiErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
