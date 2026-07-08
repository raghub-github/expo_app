import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

const DOC_KIND_MAP: Record<string, string> = {
  pan: "pan",
  gstin: "gstin",
  aadhaar: "aadhaar_digilocker",
  bank: "bank_account",
};

/**
 * GET /api/onboarding/verify-document/status?storeId=GMMC1027&docKind=aadhaar
 *
 * Latest verification status for one document of the merchant's store.
 * Used by the register-store UI to poll for async results (DigiLocker
 * Aadhaar consent completes out-of-band via webhook).
 *
 * verification_requests lives in the same shared Postgres, so we read it
 * directly with the service role instead of proxying the backend.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const storeId = url.searchParams.get("storeId");
    const docKindParam = url.searchParams.get("docKind") ?? "";
    const documentKind = DOC_KIND_MAP[docKindParam];
    if (!documentKind) {
      return NextResponse.json({ success: false, error: "Unsupported docKind." }, { status: 400 });
    }

    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const db = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await db
      .from("verification_requests")
      .select("id, status, status_reason, created_at")
      .eq("subject_type", "merchant_store")
      .eq("subject_id", access.storeIdNum)
      .eq("document_kind", documentKind)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[verify-document/status] read failed:", error.message);
      return NextResponse.json({ success: true, status: "unknown" });
    }
    if (!data) return NextResponse.json({ success: true, status: "none" });

    const status = String(data.status ?? "unknown");

    // Fetched details live in verification_events.details.verifiedData.
    let verifiedData: Record<string, unknown> | null = null;
    if (status === "verified") {
      const { data: ev } = await db
        .from("verification_events")
        .select("details")
        .eq("request_id", data.id)
        .order("created_at", { ascending: false })
        .limit(5);
      for (const e of ev ?? []) {
        const d = (e.details as { verifiedData?: Record<string, unknown> } | null)?.verifiedData;
        if (d && typeof d === "object") { verifiedData = d; break; }
      }
    }

    return NextResponse.json({
      success: true,
      status,
      verified: status === "verified",
      statusReason: data.status_reason ?? null,
      verifiedData,
    });
  } catch (e) {
    console.error("[verify-document/status] error:", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
