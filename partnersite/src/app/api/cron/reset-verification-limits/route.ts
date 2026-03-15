import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const cronSecret = process.env.CRON_SECRET;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET/POST /api/cron/reset-verification-limits
 * Resets bank_attempts_today and upi_attempts_today when last_reset_date < current date.
 * Call from cron (e.g. daily). Optional: secure with CRON_SECRET header.
 */
export async function GET(request: NextRequest) {
  return runReset(request);
}

export async function POST(request: NextRequest) {
  return runReset(request);
}

async function runReset(request: NextRequest) {
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);
    const { data: rows, error } = await db
      .from("merchant_verification_limits")
      .select("store_id, last_reset_date")
      .lt("last_reset_date", today);
    if (error) {
      console.error("[cron/reset-verification-limits] Error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    if (!rows?.length) {
      return NextResponse.json({ success: true, reset: 0, message: "No limits to reset" });
    }
    let updated = 0;
    for (const row of rows) {
      const { error: upErr } = await db
        .from("merchant_verification_limits")
        .update({
          bank_attempts_today: 0,
          upi_attempts_today: 0,
          last_reset_date: today,
        })
        .eq("store_id", row.store_id);
      if (!upErr) updated++;
    }
    return NextResponse.json({ success: true, reset: updated });
  } catch (e) {
    console.error("[cron/reset-verification-limits] Error:", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
