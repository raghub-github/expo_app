import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/auth/registered-emails
 * Returns list of registered merchant emails (for login dropdown/autocomplete).
 * Only returns owner_email for merchants that have supabase_user_id (can login with password).
 */
export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase
      .from("merchant_parents")
      .select("owner_email")
      .not("owner_email", "is", null)
      .not("supabase_user_id", "is", null)
      .eq("is_active", true)
      .order("owner_email", { ascending: true });

    if (error) {
      console.error("[registered-emails] Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch emails." },
        { status: 500 }
      );
    }

    const emails = (data || [])
      .map((r) => r.owner_email)
      .filter((e): e is string => typeof e === "string" && e.length > 0);

    return NextResponse.json({ success: true, data: { emails } });
  } catch (e) {
    console.error("[registered-emails] Error:", e);
    return NextResponse.json(
      { success: false, error: "An error occurred." },
      { status: 500 }
    );
  }
}
