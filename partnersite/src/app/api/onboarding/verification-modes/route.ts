import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

/**
 * GET /api/onboarding/verification-modes
 *
 * Per-document verification mode for merchant onboarding, straight from the
 * super-admin Policy Center (public.verification_policies). The register-store
 * UI uses this to decide what to render per doc section:
 *
 *   manual  → classic upload flow
 *   auto    → number-only input; verification failure BLOCKS (no upload offered)
 *   hybrid  → number-only input; verification failure falls back to upload
 *   disabled→ doc not accepted
 *
 * Response: { success, modes: { pan: "hybrid", gstin: "auto", bank_account: "hybrid", ... } }
 * Defaults to "manual" for any doc kind without an active policy row, so the
 * UI degrades safely if the policy table is unreachable.
 */
export async function GET() {
  try {
    // Any logged-in user may read modes (they contain no secrets), but we
    // still require a session so this isn't an open enumeration endpoint.
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const db = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await db
      .from("verification_policies")
      .select("document_kind, mode")
      .eq("subject_type", "merchant_store")
      .is("effective_to", null);

    if (error) {
      console.warn("[verification-modes] read failed:", error.message);
      return NextResponse.json({ success: true, modes: {} });
    }

    const modes: Record<string, string> = {};
    for (const row of data ?? []) {
      modes[String(row.document_kind)] = String(row.mode);
    }
    // Alias so UI keys (`aadhaar` / `aadhaar_digilocker`) share one Policy Center mode.
    if (modes.aadhaar_digilocker && !modes.aadhaar) {
      modes.aadhaar = modes.aadhaar_digilocker;
    }
    if (modes.aadhaar && !modes.aadhaar_digilocker) {
      modes.aadhaar_digilocker = modes.aadhaar;
    }
    if (modes.upi_penny_drop && !modes.upi) {
      modes.upi = modes.upi_penny_drop;
    }
    if (modes.bank_account && !modes.bank) {
      modes.bank = modes.bank_account;
    }
    return NextResponse.json({ success: true, modes });
  } catch (e) {
    console.warn("[verification-modes] error:", e);
    return NextResponse.json({ success: true, modes: {} });
  }
}
