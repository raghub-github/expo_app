import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import { fetchBackend } from "@/lib/fetch-backend";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/i;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

type BackendOutcome = {
  kind?: "auto" | "manual";
  policy?: { mode?: string; provider?: string | null };
  status?: string;
  status_reason?: string;
  verified_data?: Record<string, unknown>;
  error?: string;
  reason?: string;
  detail?: string | null;
};

/**
 * POST /api/onboarding/verify-document
 * Body: { storeId: "GMMC1027", docKind: "pan" | "gstin" | "bank",
 *         pan?, name?, gstin?, businessName?, bankAccount?, ifsc? }
 *
 * Interactive verification for the register-store step-4 UI. Proxies to the
 * backend verification engine (Cashfree per the super-admin policy) and maps
 * the result to what the UI needs:
 *
 *   { outcome: "verified", mode, verifiedData }  → show fetched details, continue
 *   { outcome: "failed",   mode }                → hybrid: reveal upload; auto: block
 *   { outcome: "manual",   mode }                → policy is manual/disabled: upload flow
 *
 * On "verified" the corresponding *_is_verified flag is set on
 * merchant_store_documents so the agent dashboard sees it as done.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const storeId = String(body.storeId ?? body.store_id ?? "");
    const docKind = String(body.docKind ?? "");

    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
    if (!secret) {
      return NextResponse.json(
        { success: false, outcome: "manual", mode: "manual", error: "Verification service not configured." },
        { status: 200 },
      );
    }

    const subject = { subject_type: "merchant_store", subject_id: access.storeIdNum };
    let path: string;
    let payload: Record<string, unknown>;

    if (docKind === "pan") {
      const pan = String(body.pan ?? "").trim().toUpperCase();
      if (!PAN_RE.test(pan)) {
        return NextResponse.json({ success: false, error: "Invalid PAN format." }, { status: 400 });
      }
      // The merchant only types the PAN number — the name Cashfree matches
      // against is sourced automatically: explicit body name → saved PAN holder
      // name → store owner / display / store name → parent business name.
      let name = String(body.name ?? "").trim();
      const db = getDb();
      if (name.length < 2) {
        const [{ data: storeRows }, { data: docRow }] = await Promise.all([
          db
            .from("merchant_stores")
            .select("owner_full_name, store_display_name, store_name, parent_id")
            .eq("id", access.storeIdNum)
            .order("id", { ascending: false })
            .limit(1),
          db
            .from("merchant_store_documents")
            .select("pan_holder_name")
            .eq("store_id", access.storeIdNum)
            .order("created_at", { ascending: false })
            .limit(1),
        ]);
        const store = storeRows?.[0];
        name = String(
          docRow?.[0]?.pan_holder_name ||
          store?.owner_full_name ||
          store?.store_display_name ||
          store?.store_name ||
          "",
        ).trim();
        if (name.length < 2 && store?.parent_id) {
          const { data: parent } = await db
            .from("merchant_parents")
            .select("owner_name, parent_name")
            .eq("id", store.parent_id)
            .limit(1);
          name = String(parent?.[0]?.owner_name || parent?.[0]?.parent_name || "").trim();
        }
      }
      if (name.length < 2) {
        return NextResponse.json({ success: false, error: "Store owner name missing — complete Store Information first." }, { status: 400 });
      }
      path = "/v1/verification/submit/pan";
      payload = { ...subject, pan, name };
    } else if (docKind === "aadhaar") {
      // Aadhaar verifies through DigiLocker consent — no number needed here.
      // The backend returns a consent URL; the result lands via webhook and is
      // read back through /api/onboarding/verify-document/status.
      path = "/v1/verification/submit/digilocker";
      payload = {
        ...subject,
        documents: ["AADHAAR"],
        redirect_url: String(body.redirectUrl ?? "").trim() || undefined,
      };
    } else if (docKind === "gstin") {
      const gstin = String(body.gstin ?? "").trim().toUpperCase();
      if (!GSTIN_RE.test(gstin)) {
        return NextResponse.json({ success: false, error: "Invalid GSTIN format." }, { status: 400 });
      }
      path = "/v1/verification/submit/gstin";
      payload = {
        ...subject,
        gstin,
        business_name: String(body.businessName ?? "").trim() || undefined,
      };
    } else if (docKind === "bank") {
      const bankAccount = String(body.bankAccount ?? "").replace(/\D/g, "");
      const ifsc = String(body.ifsc ?? "").trim().toUpperCase();
      if (!/^\d{6,20}$/.test(bankAccount)) {
        return NextResponse.json({ success: false, error: "Invalid account number." }, { status: 400 });
      }
      if (!IFSC_RE.test(ifsc)) {
        return NextResponse.json({ success: false, error: "Invalid IFSC." }, { status: 400 });
      }
      path = "/v1/verification/submit/bank";
      payload = {
        ...subject,
        bank_account: bankAccount,
        ifsc,
        name: String(body.name ?? "").trim() || undefined,
      };
    } else {
      return NextResponse.json({ success: false, error: "Unsupported docKind." }, { status: 400 });
    }

    const res = await fetchBackend(path, {
      method: "POST",
      headers: { "X-Internal-Secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: 30_000,
    });

    if (!res) {
      // Backend unreachable — treat like a provider outage: hybrid falls back
      // to upload, auto tells the user to retry later. Mode unknown → report
      // "hybrid" so the merchant is never hard-stuck because OUR server is down.
      console.error(
        "[verify-document] backend API unreachable — is the Fastify backend running on",
        process.env.GATIMITRA_BACKEND_API_URL || "http://127.0.0.1:3000",
        "?",
      );
      return NextResponse.json({
        success: true, outcome: "failed", mode: "hybrid",
        error: "Verification service is temporarily unavailable. You can upload the document instead.",
      });
    }

    const data = (await res.json().catch(() => ({}))) as BackendOutcome;

    if (!res.ok) {
      return NextResponse.json({
        success: true, outcome: "failed", mode: "hybrid",
        error: data.error === "cashfree_not_configured"
          ? "Electronic verification is temporarily unavailable."
          : `Verification failed (${data.error ?? res.status}).`,
      });
    }

    const mode = data.policy?.mode ?? "manual";

    if (data.kind === "manual") {
      const reason = String(data.reason ?? "");
      // Provider-side failures are NOT "policy says manual" — surface them as
      // failed so hybrid shows the upload fallback and auto blocks properly.
      if (reason.startsWith("provider_error") || reason === "provider_not_configured") {
        // data.detail carries Cashfree's own message (e.g. "IP not whitelisted.
        // Your current ip is x.x.x.x") — log it verbatim so ops can act.
        console.error("[verify-document] provider failure:", reason, "—", data.detail ?? "(no detail)");
        const detail = String(data.detail ?? "");
        const isIpBlock = /ip.*whitelist/i.test(detail);
        return NextResponse.json({
          success: true, outcome: "failed", mode,
          error: isIpBlock
            ? "Electronic verification is temporarily unavailable (server not yet authorised with the verification provider)."
            : reason === "provider_error_auth"
              ? "Electronic verification is temporarily unavailable (provider authentication failed)."
              : "Electronic verification is temporarily unavailable.",
        });
      }
      // Genuine policy manual / subject filtered — classic upload flow.
      return NextResponse.json({ success: true, outcome: "manual", mode, reason: reason || null });
    }

    const status = String(data.status ?? "");
    if (status === "verified") {
      // Mark the doc verified on the store's document row so the agent
      // dashboard reflects it.
      const flagCol =
        docKind === "pan" ? "pan_is_verified" :
        docKind === "gstin" ? "gst_is_verified" : null;
      if (flagCol) {
        try {
          await getDb()
            .from("merchant_store_documents")
            .update({ [flagCol]: true, [`${flagCol.replace("_is_verified", "")}_verified_at`]: new Date().toISOString() })
            .eq("store_id", access.storeIdNum);
        } catch (e) {
          console.warn("[verify-document] flag update failed:", e);
        }
      }
      return NextResponse.json({
        success: true, outcome: "verified", mode,
        verifiedData: data.verified_data ?? {},
      });
    }

    if (docKind === "aadhaar" && status === "provider_processing") {
      // DigiLocker create step succeeded — hand the consent URL to the UI.
      const url = (data.verified_data as { url?: string } | undefined)?.url ?? null;
      if (url) {
        return NextResponse.json({ success: true, outcome: "digilocker", mode, url });
      }
      return NextResponse.json({ success: true, outcome: "manual", mode, reason: "digilocker_no_url" });
    }

    if (status === "manual_review" || status === "provider_processing") {
      // Verified-ish but queued for an agent — treat as pending-manual: the
      // merchant may proceed, agents finish the check.
      return NextResponse.json({ success: true, outcome: "manual", mode, reason: status });
    }

    // rejected / failed / timeout / provider_down
    return NextResponse.json({
      success: true, outcome: "failed", mode,
      error: data.status_reason || "Document could not be verified.",
    });
  } catch (e) {
    console.error("[verify-document] error:", e);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
