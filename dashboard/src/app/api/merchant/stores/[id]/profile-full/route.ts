/**
 * GET /api/merchant/stores/[id]/profile-full
 * Single unified response for Store Profile page: store, documents, operating hours,
 * agreement, bank accounts, area manager. One request loads the entire profile.
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getStoreBankAccounts } from "@/lib/db/operations/merchant-store-bank-accounts";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
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

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

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

    let areaManagerId: number | null = null;
    if (!(await isSuperAdmin(user.id, user.email))) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }

    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 }
      );
    }

    const parent = (store as { parent?: { parent_merchant_id?: string | null; parent_name?: string | null } }).parent ??
      null;

    const storePayload = {
      id: store.id,
      store_id: store.store_id,
      name: store.store_display_name || store.store_name,
      store_name: store.store_name,
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
      logo_url: null,      banner_url: store.banner_url ?? null,
      gallery_images: store.gallery_images ?? null,
      cuisine_types: store.cuisine_types ?? null,
      food_categories: null,
      avg_preparation_time_minutes: store.avg_preparation_time_minutes ?? null,
      min_order_amount: store.min_order_amount ?? null,
      delivery_radius_km: store.delivery_radius_km ?? null,
      is_pure_veg: store.is_pure_veg ?? null,
      accepts_online_payment: store.accepts_online_payment ?? null,
      accepts_cash: store.accepts_cash ?? null,
      store_type: store.store_type ?? null,
      approval_status: store.approval_status,
      current_onboarding_step: store.current_onboarding_step ?? null,
      onboarding_completed: store.onboarding_completed ?? false,
      created_at: store.created_at ? new Date(store.created_at).toISOString() : null,
      updated_at: store.updated_at ? new Date(store.updated_at).toISOString() : null,
      parent_id: store.parent_id ?? null,
      parent_merchant_id: parent?.parent_merchant_id ?? null,
      parent_name: parent?.parent_name ?? null,
    };

    let documents: Record<string, unknown> | null = null;
    try {
      const sql = getSql();
      const docRows = await sql`
        SELECT store_id,
               pan_document_number, pan_document_url, pan_is_verified, pan_verified_at, pan_verified_by, pan_rejection_reason,
               gst_document_number, gst_document_url, gst_is_verified, gst_verified_at, gst_verified_by, gst_rejection_reason,
               aadhaar_document_number, aadhaar_document_url, aadhaar_is_verified, aadhaar_verified_at, aadhaar_verified_by, aadhaar_rejection_reason,
               fssai_document_number, fssai_document_url, fssai_expiry_date, fssai_is_verified, fssai_verified_at, fssai_verified_by, fssai_rejection_reason,
               drug_license_document_number, drug_license_document_url, drug_license_is_verified, drug_license_verified_at, drug_license_verified_by, drug_license_rejection_reason
        FROM merchant_store_documents
        WHERE store_id = ${storeId}
        LIMIT 1
      `;
      const doc = Array.isArray(docRows) ? docRows[0] : docRows;
      if (doc) {
        const d = doc as Record<string, unknown>;
        if (d.pan_verified_at instanceof Date) d.pan_verified_at = d.pan_verified_at.toISOString();
        if (d.gst_verified_at instanceof Date) d.gst_verified_at = d.gst_verified_at.toISOString();
        if (d.aadhaar_verified_at instanceof Date) d.aadhaar_verified_at = d.aadhaar_verified_at.toISOString();
        if (d.fssai_verified_at instanceof Date) d.fssai_verified_at = d.fssai_verified_at.toISOString();
        if (d.drug_license_verified_at instanceof Date) d.drug_license_verified_at = d.drug_license_verified_at.toISOString();
        documents = d;
      }
    } catch {
      // table may not exist or RLS
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
        [
          "monday_slot1_start", "monday_slot1_end", "monday_slot2_start", "monday_slot2_end",
          "tuesday_slot1_start", "tuesday_slot1_end", "tuesday_slot2_start", "tuesday_slot2_end",
          "wednesday_slot1_start", "wednesday_slot1_end", "wednesday_slot2_start", "wednesday_slot2_end",
          "thursday_slot1_start", "thursday_slot1_end", "thursday_slot2_start", "thursday_slot2_end",
          "friday_slot1_start", "friday_slot1_end", "friday_slot2_start", "friday_slot2_end",
          "saturday_slot1_start", "saturday_slot1_end", "saturday_slot2_start", "saturday_slot2_end",
          "sunday_slot1_start", "sunday_slot1_end", "sunday_slot2_start", "sunday_slot2_end",
        ].forEach((key) => {
          const v = o[key];
          if (v instanceof Date) o[key] = (v as Date).toISOString?.() ?? String(v);
        });
        operatingHours = o;
      }
    } catch {
      // table may not exist or RLS
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
      }
    } catch {
      // table may not exist or RLS
    }

    let bankAccounts: Array<Record<string, unknown>> = [];
    try {
      const accounts = await getStoreBankAccounts(store.id);
      bankAccounts = accounts as unknown as Array<Record<string, unknown>>;
    } catch (e) {
      console.warn("[profile-full] getStoreBankAccounts:", e);
    }

    let areaManager: { id: number; name: string; email: string; mobile: string } | null = null;
    const amId = (store as { area_manager_id?: number | null }).area_manager_id;
    if (amId != null) {
      try {
        const sql = getSql();
        const rows = await sql`
          SELECT am.id, su.full_name, su.email, su.mobile
          FROM area_managers am
          JOIN system_users su ON su.id = am.user_id
          WHERE am.id = ${amId}
          LIMIT 1
        `;
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (row) {
          const r = row as { id: number; full_name: string | null; email: string | null; mobile: string | null };
          areaManager = {
            id: r.id,
            name: r.full_name ?? "—",
            email: r.email ?? "—",
            mobile: r.mobile ?? "—",
          };
        }
      } catch (e) {
        console.warn("[profile-full] area manager:", e);
      }
    }

    return NextResponse.json({
      success: true,
      store: storePayload,
      documents,
      operatingHours,
      agreementAcceptance,
      bankAccounts,
      areaManager,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/profile-full]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
