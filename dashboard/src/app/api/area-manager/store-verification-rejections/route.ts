/**
 * GET /api/area-manager/store-verification-rejections?store_id=<internal id>
 * Open verification rejections for an AM-assigned store.
 * Includes store + documents snapshot so resubmit UI always has old values.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getStoreVerificationStepRejections } from "@/lib/db/operations/store-verification-steps";
import { getSql } from "@/lib/db/client";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import {
  flattenLastResubmissionOldValues,
  listLastResubmissionSnapshots,
} from "@/lib/db/operations/onboarding-resubmissions";
import { buildRejectedFieldsMetaForStep } from "@/lib/merchants/build-rejected-fields-meta";

export const runtime = "nodejs";

function asProxy(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string" || !url.trim()) return null;
  return resolveAttachmentProxyUrl(url.trim()) || url.trim();
}

function pickStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
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

    const byStep = await getStoreVerificationStepRejections(storeId);
    const rejections = Object.entries(byStep)
      .map(([step, r]) => ({
        step_number: Number(step),
        step_label: r.step_label,
        rejection_reason: r.rejection_reason,
        rejected_at: r.rejected_at,
        merchant_resubmitted_at: r.merchant_resubmitted_at,
        step_rejection_detail: r.rejection_detail,
      }))
      .sort((a, b) => a.step_number - b.step_number);

    const open = rejections;
    const minVerificationStep =
      open.length > 0 ? Math.min(...open.map((r) => r.step_number)) : null;

    const sql = getSql();
    let docsRow: Record<string, unknown> | null = null;
    try {
      const rows = (await sql`
        SELECT
          pan_document_number,
          pan_document_url,
          aadhaar_document_number,
          aadhaar_document_url,
          fssai_document_number,
          fssai_expiry_date,
          fssai_document_url,
          gst_document_number,
          gst_document_url,
          pan_rejection_reason,
          aadhaar_rejection_reason,
          fssai_rejection_reason,
          gst_rejection_reason,
          bank_proof_rejection_reason,
          step4_rejection_details
        FROM merchant_store_documents
        WHERE store_id = ${storeId}
        LIMIT 1
      `) as Record<string, unknown>[];
      docsRow = rows?.[0] ?? null;
    } catch (e) {
      console.warn("[AM store-verification-rejections] documents", e);
    }

    let bankProofUrl: string | null = null;
    try {
      const bankRows = (await sql`
        SELECT bank_proof_file_url
        FROM merchant_store_bank_accounts
        WHERE store_id = ${storeId}
          AND COALESCE(is_active, true) = true
        ORDER BY COALESCE(is_primary, false) DESC
        LIMIT 5
      `) as Array<{ bank_proof_file_url?: string | null }>;
      bankProofUrl =
        (bankRows || [])
          .map((r) => (typeof r?.bank_proof_file_url === "string" ? r.bank_proof_file_url.trim() : ""))
          .find((u) => !!u) || null;
    } catch (e) {
      console.warn("[AM store-verification-rejections] bank", e);
    }

    const fssaiExpiry = pickStr(docsRow?.fssai_expiry_date).slice(0, 10);
    const phones = Array.isArray((store as { store_phones?: unknown }).store_phones)
      ? ((store as { store_phones: unknown[] }).store_phones).map(String)
      : [];

    let lastOldValues: Record<string, string> = {};
    try {
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
      const lastRows = await listLastResubmissionSnapshots(storeId);
      const fromRows = flattenLastResubmissionOldValues(lastRows);
      lastOldValues = { ...lastOldValues, ...fromRows };
      // Normalize media URLs through proxy
      for (const k of Object.keys(lastOldValues)) {
        if (/_url$|_image|banner|bank_proof/i.test(k) || k === "banner_url") {
          const proxied = asProxy(lastOldValues[k]);
          if (proxied) lastOldValues[k] = proxied;
        }
      }
    } catch (e) {
      console.warn("[AM store-verification-rejections] last resubmissions:", e);
    }

    const documents = {
      pan_number: pickStr(docsRow?.pan_document_number),
      pan_image_url: asProxy(pickStr(docsRow?.pan_document_url) || null),
      aadhar_number: pickStr(docsRow?.aadhaar_document_number),
      aadhar_front_url: asProxy(pickStr(docsRow?.aadhaar_document_url) || null),
      fssai_number: pickStr(docsRow?.fssai_document_number),
      fssai_expiry_date: fssaiExpiry,
      fssai_image_url: asProxy(pickStr(docsRow?.fssai_document_url) || null),
      gst_number: pickStr(docsRow?.gst_document_number),
      gst_image_url: asProxy(pickStr(docsRow?.gst_document_url) || null),
      bank_proof_file_url: asProxy(bankProofUrl),
      pan_rejection_reason: pickStr(docsRow?.pan_rejection_reason),
      aadhaar_rejection_reason: pickStr(docsRow?.aadhaar_rejection_reason),
      fssai_rejection_reason: pickStr(docsRow?.fssai_rejection_reason),
      gst_rejection_reason: pickStr(docsRow?.gst_rejection_reason),
      bank_proof_rejection_reason: pickStr(docsRow?.bank_proof_rejection_reason),
      step4_rejection_details: docsRow?.step4_rejection_details ?? null,
    };

    const storeSnap: Record<string, unknown> = {
      id: store.id,
      store_id: store.store_id,
      store_name: store.store_name,
      parent_id: store.parent_id,
      store_display_name: (store as { store_display_name?: string | null }).store_display_name ?? "",
      owner_full_name: (store as { owner_full_name?: string | null }).owner_full_name ?? "",
      store_type: (store as { store_type?: string | null }).store_type ?? "",
      custom_store_type: (store as { custom_store_type?: string | null }).custom_store_type ?? "",
      store_email: (store as { store_email?: string | null }).store_email ?? "",
      store_phones: phones,
      store_description: (store as { store_description?: string | null }).store_description ?? "",
      full_address: (store as { full_address?: string | null }).full_address ?? "",
      landmark: (store as { landmark?: string | null }).landmark ?? "",
      city: (store as { city?: string | null }).city ?? "",
      state: (store as { state?: string | null }).state ?? "",
      postal_code: (store as { postal_code?: string | null }).postal_code ?? "",
      latitude:
        store.latitude != null && Number.isFinite(Number(store.latitude))
          ? Number(store.latitude)
          : null,
      longitude:
        store.longitude != null && Number.isFinite(Number(store.longitude))
          ? Number(store.longitude)
          : null,
      banner_url: asProxy((store as { banner_url?: string | null }).banner_url ?? null),
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
    console.error("[GET /api/area-manager/store-verification-rejections]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
