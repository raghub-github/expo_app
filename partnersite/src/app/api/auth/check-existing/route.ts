import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createFetchWithTimeout } from "@/lib/auth/fetch-with-timeout";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

const adminFetch = createFetchWithTimeout(5_000);

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: adminFetch },
  });
}

/**
 * GET /api/auth/check-existing?email=... or ?phone=...
 * Used during registration to check if email or phone is already registered.
 * Returns { exists: true } if found, { exists: false } otherwise.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");
    const phone = searchParams.get("phone");

    if (email !== null && email !== undefined) {
      const normalized = String(email).trim().toLowerCase();
      if (!normalized) {
        return NextResponse.json({ exists: false });
      }
      const db = getSupabaseAdmin();
      const { data, error } = await db
        .from("merchant_parents")
        .select("id")
        .eq("owner_email", normalized)
        .maybeSingle();
      if (error) {
        const msg = String(error.message || error).toLowerCase();
        if (
          msg.includes("abort") ||
          msg.includes("timeout") ||
          msg.includes("408") ||
          msg.includes("request_timeout")
        ) {
          return NextResponse.json(
            { error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
            { status: 503 }
          );
        }
        console.error("[check-existing] email lookup:", error.message);
        return NextResponse.json(
          { error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        );
      }
      return NextResponse.json({ exists: !!data });
    }

    if (phone !== null && phone !== undefined) {
      const digits = String(phone).replace(/\D/g, "");
      const ten = digits.length > 10 ? digits.slice(-10) : digits;
      if (ten.length < 10) {
        return NextResponse.json({ exists: false });
      }
      const db = getSupabaseAdmin();
      const e164 = `+91${ten}`;
      // Match validateMerchantByPhone — rows may store +91…, bare 10-digit, or 91…
      const { data, error } = await db
        .from("merchant_parents")
        .select("id")
        .or(
          [
            `registered_phone.eq.${e164}`,
            `registered_phone.eq.${ten}`,
            `registered_phone.eq.91${ten}`,
            `registered_phone_normalized.eq.${ten}`,
            `registered_phone_normalized.eq.${e164}`,
            `registered_phone_normalized.eq.91${ten}`,
          ].join(",")
        )
        .limit(1)
        .maybeSingle();
      if (error) {
        const msg = String(error.message || error).toLowerCase();
        if (
          msg.includes("abort") ||
          msg.includes("timeout") ||
          msg.includes("408") ||
          msg.includes("request_timeout")
        ) {
          return NextResponse.json(
            { error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
            { status: 503 }
          );
        }
        console.error("[check-existing] phone lookup:", error.message);
        return NextResponse.json(
          { error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        );
      }
      return NextResponse.json({ exists: !!data });
    }

    return NextResponse.json(
      { error: "Provide either email or phone query parameter." },
      { status: 400 }
    );
  } catch (e) {
    console.error("[check-existing] Error:", e);
    return NextResponse.json(
      { error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
      { status: 503 }
    );
  }
}
