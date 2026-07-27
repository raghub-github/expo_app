import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import { fetchBackend } from "@/lib/fetch-backend";

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
 * For DigiLocker Aadhaar: actively polls Cashfree via the backend so completion
 * does not depend on webhooks reaching localhost.
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

    // DigiLocker: ask backend to poll Cashfree + fetch document when AUTHENTICATED.
    if (docKindParam === "aadhaar") {
      const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
      if (secret) {
        const pollRes = await fetchBackend("/v1/verification/poll/digilocker", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": secret,
          },
          body: JSON.stringify({
            subject_type: "merchant_store",
            subject_id: access.storeIdNum,
          }),
          timeoutMs: 25_000,
        });
        if (pollRes) {
          const poll = (await pollRes.json().catch(() => ({}))) as {
            verified?: boolean;
            status?: string;
            statusReason?: string | null;
            verifiedData?: Record<string, unknown>;
          };
          if (pollRes.ok) {
            const status = String(poll.status ?? "unknown");
            return NextResponse.json({
              success: true,
              status,
              verified: !!poll.verified || status === "verified",
              statusReason: poll.statusReason ?? null,
              verifiedData: poll.verifiedData ?? null,
            });
          }
        }
      }
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
        if (d && typeof d === "object") {
          verifiedData = d;
          break;
        }
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
