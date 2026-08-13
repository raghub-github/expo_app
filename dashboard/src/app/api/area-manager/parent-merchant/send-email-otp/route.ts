/**
 * POST /api/area-manager/parent-merchant/send-email-otp
 * Send email OTP for Register Parent using an anon client so the
 * area manager dashboard session is not replaced.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const getAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      return data?.user ?? null;
    };
    const authResult = await requireAreaManagerApiAuth(getAuthUser);
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
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
