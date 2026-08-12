/**
 * GET /api/merchant/stores/[id]/verification-data
 * Full store data for step-by-step verification (all fields needed for each step).
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveMerchantApiActor } from "@/lib/merchant-food-orders/store-access";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import {
  canRevealStoreLegalDocs,
  redactStoreAgreement,
  redactStoreBankAccounts,
  redactStoreLegalDocuments,
} from "@/lib/merchants/store-legal-docs-access";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { resolveAssignedAreaManagersForStoreVerification } from "@/lib/db/operations/parent-area-managers";
import { getSql } from "@/lib/db/client";
import { mapRowToMenuMediaFile, type MenuMediaFile } from "@/lib/merchant-menu-media";
import { normalizeMerchantDocumentUrls } from "@/lib/attachments/resolve-attachment-proxy-url";
import { listPendingOnboardingResubmissions } from "@/lib/db/operations/onboarding-resubmissions";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json(
        { success: false, error: "Invalid store id" },
        { status: 400 }
      );
    }

    const actor = await resolveMerchantApiActor();
    if (!actor.ok) {
      return NextResponse.json(
        {
          success: false,
          error: actor.error,
          code: actor.status === 503 ? "SERVICE_UNAVAILABLE" : "SESSION_REQUIRED",
        },
        { status: actor.status }
      );
    }
    const user = { id: actor.id, email: actor.email };

    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Merchant dashboard access required",
          code: "MERCHANT_ACCESS_REQUIRED",
        },
        { status: 403 }
      );
    }

    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });

    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 }
      );
    }

    const storePayload = {
      id: store.id,
      store_id: store.store_id,
      name: store.store_display_name || store.store_name,
      store_name: store.store_name,
      owner_full_name:
        (store as { owner_full_name?: string | null }).owner_full_name?.trim() ||
        (store as { parent?: { owner_name?: string | null } }).parent?.owner_name?.trim() ||
        null,
      store_display_name: store.store_display_name,
      store_description: store.store_description,
      store_email: store.store_email ?? null,
      store_phones: store.store_phones ?? null,
      full_address: store.full_address ?? null,
      landmark: store.landmark ?? null,
      city: store.city ?? null,
      state: store.state ?? null,
      postal_code: store.postal_code ?? null,
      country: store.country ?? null,
      latitude: store.latitude ?? null,
      longitude: store.longitude ?? null,
      logo_url: null,
      banner_url: store.banner_url ?? null,
      gallery_images: store.gallery_images ?? null,
      cuisine_types: store.cuisine_types ?? null,
      food_categories: (store as { food_categories?: string[] | null }).food_categories ?? null,
      avg_preparation_time_minutes: store.avg_preparation_time_minutes ?? null,
      packaging_charge_amount:
        (store as { packaging_charge_amount?: number | null }).packaging_charge_amount ?? null,
      min_order_amount: store.min_order_amount ?? null,
      delivery_radius_km: store.delivery_radius_km ?? null,
      is_pure_veg: store.is_pure_veg ?? null,
      accepts_online_payment: store.accepts_online_payment ?? null,
      accepts_cash: store.accepts_cash ?? null,
      store_type: store.store_type ?? null,
      custom_store_type: (store as { custom_store_type?: string | null }).custom_store_type ?? null,
      approval_status: store.approval_status,
      current_onboarding_step: store.current_onboarding_step ?? null,
      onboarding_completed: store.onboarding_completed ?? false,
      created_at: store.created_at ? new Date(store.created_at).toISOString() : null,
      updated_at: store.updated_at ? new Date(store.updated_at).toISOString() : null,
    };

    let documents: Record<string, unknown> | null = null;
    try {
      const sql = getSql();
      const docRows = await sql`
        SELECT *
        FROM merchant_store_documents
        WHERE store_id = ${storeId}
        LIMIT 1
      `;
      const doc = Array.isArray(docRows) ? docRows[0] : docRows;
      if (doc) {
        const d = doc as Record<string, unknown>;
        // Normalize all date-like fields to ISO strings so frontend always gets serializable values.
        Object.keys(d).forEach((key) => {
          const value = d[key];
          if (value instanceof Date) d[key] = value.toISOString();
        });
        documents = normalizeMerchantDocumentUrls(d);
        if (!storePayload.owner_full_name) {
          const panHolder =
            typeof d.pan_holder_name === "string" ? d.pan_holder_name.trim() : "";
          if (panHolder) storePayload.owner_full_name = panHolder;
        }
      }
    } catch (e) {
      console.warn("[verification-data] merchant_store_documents:", e);
    }

    let operatingHours: Record<string, unknown> | null = null;
    try {
      const sql = getSql();
      const ohRows = await sql`
        SELECT store_id,
               monday_open, monday_slot1_start, monday_slot1_end, monday_slot2_start, monday_slot2_end,
               tuesday_open, tuesday_slot1_start, tuesday_slot1_end, tuesday_slot2_start, tuesday_slot2_end,
               wednesday_open, wednesday_slot1_start, wednesday_slot1_end, wednesday_slot2_start, wednesday_slot2_end,
               thursday_open, thursday_slot1_start, thursday_slot1_end, thursday_slot2_start, thursday_slot2_end,
               friday_open, friday_slot1_start, friday_slot1_end, friday_slot2_start, friday_slot2_end,
               saturday_open, saturday_slot1_start, saturday_slot1_end, saturday_slot2_start, saturday_slot2_end,
               sunday_open, sunday_slot1_start, sunday_slot1_end, sunday_slot2_start, sunday_slot2_end,
               is_24_hours, same_for_all_days, closed_days
        FROM merchant_store_operating_hours
        WHERE store_id = ${storeId}
        LIMIT 1
      `;
      const row = Array.isArray(ohRows) ? ohRows[0] : ohRows;
      if (row) {
        const o = row as Record<string, unknown>;
        [ "monday_slot1_start", "monday_slot1_end", "monday_slot2_start", "monday_slot2_end",
          "tuesday_slot1_start", "tuesday_slot1_end", "tuesday_slot2_start", "tuesday_slot2_end",
          "wednesday_slot1_start", "wednesday_slot1_end", "wednesday_slot2_start", "wednesday_slot2_end",
          "thursday_slot1_start", "thursday_slot1_end", "thursday_slot2_start", "thursday_slot2_end",
          "friday_slot1_start", "friday_slot1_end", "friday_slot2_start", "friday_slot2_end",
          "saturday_slot1_start", "saturday_slot1_end", "saturday_slot2_start", "saturday_slot2_end",
          "sunday_slot1_start", "sunday_slot1_end", "sunday_slot2_start", "sunday_slot2_end"
        ].forEach((key) => {
          const v = o[key];
          if (v instanceof Date) o[key] = v.toISOString?.() ?? String(v);
        });
        operatingHours = o;
      }
    } catch {
      // table may not exist or RLS
    }

    let onboardingPayments: Record<string, unknown>[] = [];
    try {
      const sql = getSql();
      const storeIdNum = Number(storeId);

      // Step 7 (Commission plan) is sourced from merchant_onboarding_payments.
      // This is tied to a specific merchant_store (merchant_store_id -> merchant_stores.id).
      const payRows = await sql`
        SELECT
          id,
          merchant_parent_id,
          merchant_store_id,
          amount_paise,
          currency,
          plan_id,
          plan_name,
          standard_amount_paise,
          promo_amount_paise,
          promo_label,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          razorpay_status,
          status,
          payer_email,
          payer_phone,
          payer_name,
          ip_address,
          user_agent,
          created_at,
          captured_at,
          failed_at,
          failure_reason,
          metadata
        FROM merchant_onboarding_payments
        WHERE merchant_store_id = ${storeIdNum}
        ORDER BY created_at DESC
        LIMIT 10
      `;

      const rows = Array.isArray(payRows) ? payRows : [];
      onboardingPayments = rows.map((r) => {
        const o = r as Record<string, unknown>;
        const amountPaise =
          typeof o.amount_paise === "number"
            ? o.amount_paise
            : Number((o.amount_paise as unknown) ?? 0) || 0;

        const toIsoOrNull = (v: unknown) => {
          if (v instanceof Date) return v.toISOString();
          if (v == null) return null;
          const s = String(v);
          return s.trim() ? s : null;
        };

        const createdIso = toIsoOrNull(o.created_at) ?? "";
        const capturedIso = toIsoOrNull(o.captured_at);
        const failedIso = toIsoOrNull(o.failed_at);

        return {
          id: o.id,
          amount_paise: amountPaise,
          currency: (o.currency as string) ?? "INR",
          plan_id: o.plan_id,
          plan_name: o.plan_name,
          standard_amount_paise:
            typeof o.standard_amount_paise === "number"
              ? o.standard_amount_paise
              : o.standard_amount_paise ?? null,
          promo_amount_paise:
            typeof o.promo_amount_paise === "number"
              ? o.promo_amount_paise
              : o.promo_amount_paise ?? null,
          promo_label: (o.promo_label as string) ?? null,
          razorpay_order_id: (o.razorpay_order_id as string) ?? null,
          razorpay_payment_id: (o.razorpay_payment_id as string) ?? null,
          status: (o.status as string) ?? "pending",
          payer_email: (o.payer_email as string) ?? null,
          payer_phone: (o.payer_phone as string) ?? null,
          payer_name: (o.payer_name as string) ?? null,
          created_at: createdIso,
          captured_at: capturedIso,
          failed_at: failedIso,
          failure_reason: (o.failure_reason as string) ?? null,
          // Kept for backward compatibility with UI mapping.
          billing_period_start: null,
          billing_period_end: null,
          razorpay_signature: (o.razorpay_signature as string) ?? null,
          razorpay_status: (o.razorpay_status as string) ?? null,
          ip_address: (o.ip_address as string) ?? null,
          user_agent: (o.user_agent as string) ?? null,
          metadata: o.metadata ?? {},
        } as Record<string, unknown>;
      });

      if (process.env.NODE_ENV !== "production") {
        console.info(
          `[verification-data] storeId=${storeId} merchant_onboarding_payments=${onboardingPayments.length}`
        );
      }
    } catch (e) {
      console.warn("[verification-data] merchant_onboarding_payments lookup failed:", e);
    }

    let agreementAcceptance: Record<string, unknown> | null = null;
    try {
      const sql = getSql();
      const aggRows = await sql`
        SELECT id, store_id, template_id, template_key, template_version, contract_pdf_url,
               signer_name, signer_email, signer_phone, signature_data_url, signature_hash,
               terms_accepted, contract_read_confirmed, accepted_at, acceptance_source,
               commission_first_month_pct, commission_from_second_month_pct,
               agreement_effective_from, agreement_effective_to, created_at
        FROM merchant_store_agreement_acceptances
        WHERE store_id = ${storeId}
        ORDER BY accepted_at DESC
        LIMIT 1
      `;
      const row = Array.isArray(aggRows) ? aggRows[0] : aggRows;
      if (row) {
        const o = row as Record<string, unknown>;
        ["accepted_at", "agreement_effective_from", "agreement_effective_to", "created_at"].forEach((k) => {
          const v = o[k];
          if (v instanceof Date) o[k] = v.toISOString();
        });
        agreementAcceptance = o;
        if (!storePayload.owner_full_name) {
          const signer =
            typeof o.signer_name === "string" ? o.signer_name.trim() : "";
          if (signer) storePayload.owner_full_name = signer;
        }
      }
    } catch {
      // table may not exist or RLS
    }

    let menuMediaFiles: MenuMediaFile[] = [];
    try {
      const sql = getSql();
      const mediaRows = await sql`
        SELECT id, store_id, media_scope, source_entity, original_file_name, r2_key, public_url, menu_url,
               mime_type, file_size_bytes, verification_status, created_at, menu_reference_image_urls
        FROM merchant_store_media_files
        WHERE store_id = ${storeId}
          AND media_scope = 'MENU_REFERENCE'
          AND is_active = true
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `;
      const rows = Array.isArray(mediaRows) ? mediaRows : [mediaRows];
      menuMediaFiles = rows.map((r: Record<string, unknown>) => mapRowToMenuMediaFile(r));
    } catch (e) {
      console.warn("[verification-data] merchant_store_media_files:", e);
    }

    let bankAccounts: Record<string, unknown>[] = [];
    try {
      const sql = getSql();
      const bankRows = await sql`
        SELECT
          id, store_id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type,
          is_verified, verified_by, verified_at, verification_method, upi_id, upi_verified,
          is_primary, is_active, payout_method, bank_proof_type, bank_proof_file_url, upi_qr_screenshot_url,
          verification_status, is_disabled, beneficiary_name, razorpay_fund_account_id, razorpay_validation_id,
          created_at, updated_at
        FROM merchant_store_bank_accounts
        WHERE store_id = ${storeId}
        ORDER BY COALESCE(is_primary, false) DESC, id ASC
      `;
      const rows = Array.isArray(bankRows) ? bankRows : [bankRows];
      bankAccounts = rows
        .filter((r) => r && typeof r === "object")
        .map((r) => {
          const o = r as Record<string, unknown>;
          ["verified_at", "created_at", "updated_at", "last_attempt_at"].forEach((k) => {
            const v = o[k];
            if (v instanceof Date) o[k] = v.toISOString();
          });
          return o;
        });
    } catch (e) {
      console.warn("[verification-data] merchant_store_bank_accounts:", e);
    }

    let assignedAreaManagers: {
      id: number;
      full_name: string | null;
      email: string | null;
      mobile: string | null;
    }[] = [];
    try {
      const amId = (store as { area_manager_id?: number | null }).area_manager_id ?? null;
      assignedAreaManagers = await resolveAssignedAreaManagersForStoreVerification(storeId, amId);
    } catch (e) {
      console.warn("[verification-data] assignedAreaManagers:", e);
    }

    let pendingResubmissions: Awaited<ReturnType<typeof listPendingOnboardingResubmissions>> = [];
    try {
      pendingResubmissions = await listPendingOnboardingResubmissions(storeId);
      // Do NOT overwrite live store/documents URLs — admin UI shows Old (live) + New (pending) side by side.
      // Mark flags only so existing badges still work.
      if (documents && pendingResubmissions.length > 0) {
        const docs = { ...documents } as Record<string, unknown>;
        for (const p of pendingResubmissions) {
          if (p.field_key === "fssai") docs.fssai_pending_resubmission = true;
          else if (p.field_key === "pan") docs.pan_pending_resubmission = true;
          else if (p.field_key === "gst") docs.gst_pending_resubmission = true;
          else if (p.field_key === "aadhaar") docs.aadhaar_pending_resubmission = true;
          else if (p.field_key === "bank_proof") docs.bank_proof_pending_resubmission = true;
          if (p.field_key === "banner_url") {
            (
              storePayload as { banner_pending_resubmission?: boolean }
            ).banner_pending_resubmission = true;
          }
        }
        documents = docs;
      }
    } catch (e) {
      console.warn("[verification-data] pending resubmissions:", e);
    }

    const canRevealLegal = await canRevealStoreLegalDocs({
      supabaseAuthId: user.id,
      email: user.email,
      store: {
        id: store.id,
        area_manager_id: (store as { area_manager_id?: number | null }).area_manager_id ?? null,
        parent_id: (store as { parent_id?: number | null }).parent_id ?? null,
      },
    });
    const legalDocsRestricted = !canRevealLegal;

    return NextResponse.json({
      success: true,
      store: storePayload,
      documents: legalDocsRestricted ? redactStoreLegalDocuments(documents) : documents,
      operatingHours,
      onboardingPayments,
      agreementAcceptance: legalDocsRestricted
        ? redactStoreAgreement(agreementAcceptance)
        : agreementAcceptance,
      menuMediaFiles,
      bankAccounts: legalDocsRestricted
        ? redactStoreBankAccounts(bankAccounts)
        : bankAccounts,
      assignedAreaManagers,
      pendingResubmissions,
      legalDocsRestricted,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/verification-data]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
