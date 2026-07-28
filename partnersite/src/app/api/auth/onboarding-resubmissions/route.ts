/**
 * POST /api/auth/onboarding-resubmissions
 * Stage partner re-uploads after rejection (does not overwrite main live columns).
 * Also sets step4_resubmission_flags + merchant_resubmitted_at so admin can verify.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { createClient } from "@supabase/supabase-js";
import {
  markDocumentResubmissionFlags,
  upsertPendingOnboardingResubmissions,
  type ResubmissionItemInput,
} from "@/lib/onboarding/onboarding-resubmissions";
import { markMerchantResubmittedForRejectedSteps } from "@/lib/onboarding/verification-resubmission";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const DOC_KEYS = new Set([
  "pan",
  "gst",
  "aadhaar",
  "fssai",
  "drug_license",
  "trade_license",
  "shop_establishment",
  "udyam",
  "pharmacist_certificate",
  "pharmacy_council_registration",
  "bank_proof",
  "other",
]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json(
        { success: false, error: validation.error ?? "Merchant not found" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const storePublicId = String(body.storePublicId || body.store_public_id || "").trim();
    const itemsRaw = Array.isArray(body.items) ? body.items : [];
    const finalize = body.finalize === true || body.finalize === "true" || body.finalize === 1;
    if (!storePublicId) {
      return NextResponse.json({ success: false, error: "storePublicId is required" }, { status: 400 });
    }
    if (itemsRaw.length === 0 && !finalize) {
      return NextResponse.json({ success: false, error: "items required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: storeRow, error: storeErr } = await db
      .from("merchant_stores")
      .select("id, parent_id")
      .eq("store_id", storePublicId)
      .eq("parent_id", validation.merchantParentId)
      .maybeSingle();

    if (storeErr || !storeRow?.id) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const storeDbId = storeRow.id as number;
    const items: ResubmissionItemInput[] = [];
    for (const raw of itemsRaw) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const verificationStep = Math.floor(Number(r.verificationStep ?? r.verification_step));
      const fieldKey = String(r.fieldKey ?? r.field_key ?? "").trim();
      const payload =
        r.payload && typeof r.payload === "object" && !Array.isArray(r.payload)
          ? (r.payload as Record<string, unknown>)
          : {};
      if (!Number.isFinite(verificationStep) || !fieldKey) continue;
      items.push({
        verificationStep,
        fieldKey,
        payload,
        r2ObjectKey:
          typeof r.r2ObjectKey === "string"
            ? r.r2ObjectKey
            : typeof r.r2_object_key === "string"
              ? r.r2_object_key
              : null,
        proxyUrl:
          typeof r.proxyUrl === "string"
            ? r.proxyUrl
            : typeof r.proxy_url === "string"
              ? r.proxy_url
              : typeof payload.proxy_url === "string"
                ? String(payload.proxy_url)
                : null,
      });
    }

    if (items.length === 0 && !finalize) {
      return NextResponse.json({ success: false, error: "No valid items" }, { status: 400 });
    }

    let saved = 0;
    if (items.length > 0) {
      const result = await upsertPendingOnboardingResubmissions(db, {
        storeDbId,
        parentId: validation.merchantParentId,
        authUserId: user.id,
        items,
      });
      saved = result.saved;
    }

    const stepsFromItems = Array.from(new Set(items.map((i) => i.verificationStep)));

    if (finalize) {
      const { data: pendingRows } = await db
        .from("merchant_store_onboarding_resubmissions")
        .select("verification_step, field_key")
        .eq("store_id", storeDbId)
        .eq("status", "pending");

      const pending = Array.isArray(pendingRows) ? pendingRows : [];
      const docKeys = Array.from(
        new Set(
          pending
            .map((p) => String((p as { field_key?: string }).field_key || ""))
            .concat(items.map((i) => i.fieldKey))
            .filter((k) => DOC_KEYS.has(k))
        )
      );
      if (docKeys.length > 0) {
        await markDocumentResubmissionFlags(db, storeDbId, docKeys);
      }

      const finalizeStepsRaw = Array.isArray(body.finalizeSteps) ? body.finalizeSteps : [];
      const finalizeSteps = Array.from(
        new Set(
          [
            ...stepsFromItems,
            ...pending.map((p) => Number((p as { verification_step?: number }).verification_step)),
            ...finalizeStepsRaw.map((n: unknown) => Math.floor(Number(n))),
          ].filter((n) => Number.isFinite(n) && n >= 1 && n <= 8)
        )
      );
      if (finalizeSteps.length > 0) {
        await markMerchantResubmittedForRejectedSteps(db, storeDbId, finalizeSteps);
      }
    }

    return NextResponse.json({
      success: true,
      saved,
      steps: stepsFromItems,
      finalize,
      message: finalize
        ? "Resubmitted details saved for admin review"
        : "Draft resubmission saved",
    });
  } catch (e) {
    console.error("[POST /api/auth/onboarding-resubmissions]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

/** GET pending resubmissions for a store (merchant-owned). */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json(
        { success: false, error: validation.error ?? "Merchant not found" },
        { status: 403 }
      );
    }

    const storePublicId = request.nextUrl.searchParams.get("store_public_id")?.trim();
    if (!storePublicId) {
      return NextResponse.json({ success: false, error: "store_public_id required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: storeRow } = await db
      .from("merchant_stores")
      .select("id")
      .eq("store_id", storePublicId)
      .eq("parent_id", validation.merchantParentId)
      .maybeSingle();
    if (!storeRow?.id) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const { data, error } = await db
      .from("merchant_store_onboarding_resubmissions")
      .select(
        "id, verification_step, field_key, payload, r2_object_key, proxy_url, status, submitted_at"
      )
      .eq("store_id", storeRow.id)
      .eq("status", "pending")
      .order("submitted_at", { ascending: false });

    if (error) {
      console.warn("[GET onboarding-resubmissions]", error.message);
      return NextResponse.json({ success: true, items: [] });
    }

    return NextResponse.json({ success: true, items: data ?? [] });
  } catch (e) {
    console.error("[GET /api/auth/onboarding-resubmissions]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
