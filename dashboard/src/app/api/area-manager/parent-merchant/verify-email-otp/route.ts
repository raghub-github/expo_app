/**
 * POST /api/area-manager/parent-merchant/verify-email-otp
 * Verify email OTP for Register Parent (same as partnersite). Uses Supabase Auth;
 * verifies with anon client so area manager session is not replaced.
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

    const { email, code } = await req.json();
    const raw = typeof email === "string" ? email.trim().toLowerCase() : "";
    const token = typeof code === "string" ? code.replace(/\s/g, "").trim() : "";

    if (!raw || !/^\S+@\S+\.\S+$/.test(raw)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (!token || token.length < 6) {
      return NextResponse.json({ error: "Enter the verification code from your email" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.verifyOtp({
      email: raw,
      token,
      type: "email",
    });

    if (error) {
      const msg = error.message || "Invalid or expired code.";
      return NextResponse.json(
        { error: msg.includes("expired") || msg.includes("invalid") ? "The verification code has expired or is invalid. Request a new code." : msg },
        { status: 400 }
      );
    }

    const userId = data?.user?.id ?? null;
    return NextResponse.json({
      success: true,
      verifiedEmail: data?.user?.email ?? raw,
      supabase_user_id: userId,
    });
  } catch (e) {
    console.error("[POST /api/area-manager/parent-merchant/verify-email-otp]", e);
    const { body, status } = apiErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
