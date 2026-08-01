/**
 * POST /api/area-manager/onboarding-resubmissions
 * Stage AM-fixed onboarding details after admin rejection (same table as partner).
 * GET  /api/area-manager/onboarding-resubmissions?store_id= — list pending rows.
 *
 * Body.finalize:
 * - false (default for mid-wizard Continue): upsert pending only (survives refresh)
 * - true (final Submit): also set step4_resubmission_flags + merchant_resubmitted_at
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import {
  listPendingOnboardingResubmissions,
  markDocumentResubmissionFlags,
  upsertPendingOnboardingResubmissions,
  type ResubmissionItemInput,
} from "@/lib/db/operations/onboarding-resubmissions";
import { markMerchantResubmittedForRejectedSteps } from "@/lib/db/operations/store-verification-steps";

export const runtime = "nodejs";

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

function parseItems(itemsRaw: unknown[]): ResubmissionItemInput[] {
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
  return items;
}

export async function GET(request: NextRequest) {
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

    const storeId = Number(request.nextUrl.searchParams.get("store_id"));
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return NextResponse.json({ success: false, error: "store_id required" }, { status: 400 });
    }

    const areaManagerId = authResult.resolved.isSuperAdmin
      ? null
      : authResult.resolved.areaManager.id > 0
        ? authResult.resolved.areaManager.id
        : null;
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const pending = await listPendingOnboardingResubmissions(storeId);
    return NextResponse.json({
      success: true,
      items: pending.map((p) => ({
        id: p.id,
        verification_step: p.verification_step,
        field_key: p.field_key,
        payload: p.payload,
        r2_object_key: p.r2_object_key,
        proxy_url: p.proxy_url,
        status: p.status,
      })),
    });
  } catch (e) {
    console.error("[GET /api/area-manager/onboarding-resubmissions]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const storeId = Number(body.storeId ?? body.store_id);
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return NextResponse.json({ success: false, error: "storeId required" }, { status: 400 });
    }

    const finalize = body.finalize === true || body.finalize === "true" || body.finalize === 1;
    const areaManagerId = authResult.resolved.isSuperAdmin
      ? null
      : authResult.resolved.areaManager.id > 0
        ? authResult.resolved.areaManager.id
        : null;
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const itemsRaw = Array.isArray(body.items) ? body.items : [];
    const items = parseItems(itemsRaw);

    if (items.length === 0 && !finalize) {
      return NextResponse.json({ success: false, error: "No valid items" }, { status: 400 });
    }

    let saved = 0;
    if (items.length > 0) {
      const result = await upsertPendingOnboardingResubmissions({
        storeDbId: storeId,
        parentId: store.parent_id != null ? Number(store.parent_id) : null,
        authUserId: null,
        items,
      });
      saved = result.saved;
    }

    const stepsFromItems = Array.from(new Set(items.map((i) => i.verificationStep)));

    if (finalize) {
      const pending = await listPendingOnboardingResubmissions(storeId);
      const docKeys = Array.from(
        new Set(
          pending
            .map((p) => p.field_key)
            .concat(items.map((i) => i.fieldKey))
            .filter((k) => DOC_KEYS.has(k))
        )
      );
      if (docKeys.length > 0) {
        await markDocumentResubmissionFlags(storeId, docKeys);
      }

      const finalizeStepsRaw = Array.isArray(body.finalizeSteps) ? body.finalizeSteps : [];
      const finalizeSteps = Array.from(
        new Set(
          [
            ...stepsFromItems,
            ...pending.map((p) => p.verification_step),
            ...finalizeStepsRaw.map((n: unknown) => Math.floor(Number(n))),
          ].filter((n) => Number.isFinite(n) && n >= 1 && n <= 8)
        )
      );
      if (finalizeSteps.length > 0) {
        await markMerchantResubmittedForRejectedSteps(storeId, finalizeSteps);
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
    console.error("[POST /api/area-manager/onboarding-resubmissions]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
