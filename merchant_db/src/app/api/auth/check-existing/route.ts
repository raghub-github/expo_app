import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
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
      const { data } = await db
        .from("merchant_parents")
        .select("id")
        .eq("owner_email", normalized)
        .maybeSingle();
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
      const { data } = await db
        .from("merchant_parents")
        .select("id")
        .or(`registered_phone.eq.${e164},registered_phone_normalized.eq.${ten}`)
        .maybeSingle();
      return NextResponse.json({ exists: !!data });
    }

    return NextResponse.json(
      { error: "Provide either email or phone query parameter." },
      { status: 400 }
    );
  } catch (e) {
    console.error("[check-existing] Error:", e);
    return NextResponse.json(
      { error: "Check failed. Please try again." },
      { status: 500 }
    );
  }
}
