/**
 * GET /api/auth/store-verification-rejections?store_public_id=GMMCxxxx
 * Active step rejections for the merchant's store (for onboarding lock / Review & fix).
 * Also returns a store snapshot so resubmit UI can show old values when progress JSON is empty.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { createClient } from "@supabase/supabase-js";
import { normalizeMerchantStoreMediaUrl, toStoredDocumentUrl } from "@/lib/r2";
import {
  flattenLastResubmissionOldValues,
  listLastResubmissionSnapshots,
} from "@/lib/onboarding/onboarding-resubmissions";
import { buildRejectedFieldsMetaForStep } from "@/lib/onboarding/build-rejected-fields-meta";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function asProxy(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string" || !url.trim()) return null;
  return (
    normalizeMerchantStoreMediaUrl(url.trim()) ||
    toStoredDocumentUrl(url.trim()) ||
    url.trim()
  );
}

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
      return NextResponse.json(
        { success: false, error: "store_public_id is required" },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();
    const { data: storeRow, error: storeErr } = await db
      .from("merchant_stores")
      .select(
        "id, parent_id, store_id, store_name, store_display_name, owner_full_name, store_type, custom_store_type, store_email, store_phones, store_description, full_address, landmark, city, state, postal_code, latitude, longitude, banner_url"
      )
      .eq("store_id", storePublicId)
      .eq("parent_id", validation.merchantParentId)
      .maybeSingle();

    if (storeErr || !storeRow?.id) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const internalId = storeRow.id as number;
    const { data: rows, error: rejErr } = await db
      .from("store_verification_step_rejections")
      .select(
        "step_number, step_label, rejection_reason, rejected_at, merchant_resubmitted_at, step_rejection_detail"
      )
      .eq("store_id", internalId)
      .order("step_number", { ascending: true });

    if (rejErr) {
      console.warn("[store-verification-rejections]", rejErr.message);
      return NextResponse.json({
        success: true,
        rejections: [],
        min_verification_step: null,
        store: null,
      });
    }

    const rejections = (rows ?? []).map((r) => ({
      step_number: Number(r.step_number),
      step_label: (r.step_label as string | null) ?? null,
      rejection_reason: String(r.rejection_reason ?? ""),
      rejected_at:
        typeof r.rejected_at === "string"
          ? r.rejected_at
          : r.rejected_at != null
            ? String(r.rejected_at)
            : "",
      merchant_resubmitted_at:
        r.merchant_resubmitted_at == null
          ? null
          : typeof r.merchant_resubmitted_at === "string"
            ? r.merchant_resubmitted_at
            : String(r.merchant_resubmitted_at),
      step_rejection_detail: (r as { step_rejection_detail?: unknown }).step_rejection_detail ?? null,
    }));

    const minVerificationStep =
      rejections.length > 0 ? Math.min(...rejections.map((x) => x.step_number)) : null;

    const { data: docsRow, error: docsErr } = await db
      .from("merchant_store_documents")
      .select(
        "pan_document_number, pan_document_url, aadhaar_document_number, aadhaar_document_url, fssai_document_number, fssai_expiry_date, fssai_document_url, gst_document_number, gst_document_url, pan_rejection_reason, aadhaar_rejection_reason, fssai_rejection_reason, gst_rejection_reason, bank_proof_rejection_reason, step4_rejection_details"
      )
      .eq("store_id", internalId)
      .maybeSingle();

    if (docsErr) {
      console.warn("[store-verification-rejections] documents", docsErr.message);
    }

    const { data: bankRows } = await db
      .from("merchant_store_bank_accounts")
      .select("bank_proof_file_url")
      .eq("store_id", internalId)
      .limit(5);

    const bankProofUrl =
      (bankRows || [])
        .map((r) => (typeof r?.bank_proof_file_url === "string" ? r.bank_proof_file_url.trim() : ""))
        .find((u) => !!u) || null;

    const phones = Array.isArray(storeRow.store_phones)
      ? (storeRow.store_phones as unknown[]).map(String)
      : [];

    const expiryRaw = docsRow?.fssai_expiry_date;
    const fssaiExpiry =
      typeof expiryRaw === "string"
        ? expiryRaw.slice(0, 10)
        : expiryRaw != null
          ? String(expiryRaw).slice(0, 10)
          : "";

    let lastOldValues: Record<string, string> = {};
    try {
      // Prefer durable snapshot written on re-reject; table rows overwrite when present.
      for (const r of rejections) {
        const detail = r.step_rejection_detail;
        if (!detail || typeof detail !== "object" || Array.isArray(detail)) continue;
        const snap = (detail as { last_resubmitted?: unknown }).last_resubmitted;
        if (!snap || typeof snap !== "object" || Array.isArray(snap)) continue;
        for (const [k, v] of Object.entries(snap as Record<string, unknown>)) {
          if (typeof v === "string" && v.trim() && !lastOldValues[k]) {
            lastOldValues[k] = v.trim();
          }
        }
      }
      const lastRows = await listLastResubmissionSnapshots(db, internalId);
      const fromRows = flattenLastResubmissionOldValues(lastRows);
      lastOldValues = { ...lastOldValues, ...fromRows };
      for (const k of Object.keys(lastOldValues)) {
        if (/_url$|_image|banner|bank_proof/i.test(k) || k === "banner_url") {
          const proxied = asProxy(lastOldValues[k]);
          if (proxied) lastOldValues[k] = proxied;
        }
      }
    } catch (e) {
      console.warn("[store-verification-rejections] last resubmissions:", e);
    }

    const documents = {
      pan_number: String(docsRow?.pan_document_number || ""),
      pan_image_url: asProxy(
        typeof docsRow?.pan_document_url === "string" ? docsRow.pan_document_url : null
      ),
      aadhar_number: String(docsRow?.aadhaar_document_number || ""),
      aadhar_front_url: asProxy(
        typeof docsRow?.aadhaar_document_url === "string" ? docsRow.aadhaar_document_url : null
      ),
      fssai_number: String(docsRow?.fssai_document_number || ""),
      fssai_expiry_date: fssaiExpiry,
      fssai_image_url: asProxy(
        typeof docsRow?.fssai_document_url === "string" ? docsRow.fssai_document_url : null
      ),
      gst_number: String(docsRow?.gst_document_number || ""),
      gst_image_url: asProxy(
        typeof docsRow?.gst_document_url === "string" ? docsRow.gst_document_url : null
      ),
      bank_proof_file_url: asProxy(bankProofUrl),
      pan_rejection_reason: String(
        (docsRow as { pan_rejection_reason?: string } | null)?.pan_rejection_reason || ""
      ),
      aadhaar_rejection_reason: String(
        (docsRow as { aadhaar_rejection_reason?: string } | null)?.aadhaar_rejection_reason || ""
      ),
      fssai_rejection_reason: String(
        (docsRow as { fssai_rejection_reason?: string } | null)?.fssai_rejection_reason || ""
      ),
      gst_rejection_reason: String(
        (docsRow as { gst_rejection_reason?: string } | null)?.gst_rejection_reason || ""
      ),
      bank_proof_rejection_reason: String(
        (docsRow as { bank_proof_rejection_reason?: string } | null)?.bank_proof_rejection_reason ||
          ""
      ),
      step4_rejection_details:
        (docsRow as { step4_rejection_details?: unknown } | null)?.step4_rejection_details ?? null,
    };

    const storeSnap: Record<string, unknown> = {
      id: internalId,
      parent_id: storeRow.parent_id != null ? Number(storeRow.parent_id) : null,
      store_id: String(storeRow.store_id || storePublicId),
      store_name: String(storeRow.store_name || ""),
      store_display_name: String(storeRow.store_display_name || ""),
      owner_full_name: String(storeRow.owner_full_name || ""),
      store_type: String(storeRow.store_type || ""),
      custom_store_type: String(storeRow.custom_store_type || ""),
      store_email: String(storeRow.store_email || ""),
      store_phones: phones,
      store_description: String(storeRow.store_description || ""),
      full_address: String(storeRow.full_address || ""),
      landmark: String(storeRow.landmark || ""),
      city: String(storeRow.city || ""),
      state: String(storeRow.state || ""),
      postal_code: String(storeRow.postal_code || ""),
      latitude:
        storeRow.latitude != null && Number.isFinite(Number(storeRow.latitude))
          ? Number(storeRow.latitude)
          : null,
      longitude:
        storeRow.longitude != null && Number.isFinite(Number(storeRow.longitude))
          ? Number(storeRow.longitude)
          : null,
      banner_url: asProxy(
        typeof storeRow.banner_url === "string" ? storeRow.banner_url : null
      ),
      documents,
    };

    const rejectionsWithMeta = rejections.map((r) => ({
      ...r,
      rejectedFieldsMeta: buildRejectedFieldsMetaForStep({
        step: r.step_number,
        rejectionReason: r.rejection_reason,
        stepRejectionDetail: r.step_rejection_detail,
        storeSnap,
        documents,
        lastOldValues,
      }),
    }));

    return NextResponse.json({
      success: true,
      rejections: rejectionsWithMeta,
      min_verification_step: minVerificationStep,
      lastOldValues,
      store: storeSnap,
    });
  } catch (e) {
    console.error("[GET /api/auth/store-verification-rejections]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
