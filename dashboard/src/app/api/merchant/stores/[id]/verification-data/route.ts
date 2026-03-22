/**
 * GET /api/merchant/stores/[id]/verification-data
 * Full store data for step-by-step verification (all fields needed for each step).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { resolveAssignedAreaManagersForStoreVerification } from "@/lib/db/operations/parent-area-managers";
import { getSql } from "@/lib/db/client";
import { mapRowToMenuMediaFile, type MenuMediaFile } from "@/lib/merchant-menu-media";

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
        documents = d;
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

      // Use subscription_payments + merchant_subscriptions so we only show payments
      // for the store currently being verified (no other stores for this parent).
      const payRows = await sql`
        SELECT
          sp.id,
          sp.amount,
          sp.payment_status,
          sp.payment_date,
          sp.billing_period_start,
          sp.billing_period_end,
          sp.payment_gateway,
          sp.payment_gateway_id,
          sp.notes,
          sp.plan_id,
          mp.plan_name
        FROM subscription_payments sp
        JOIN merchant_subscriptions ms ON ms.id = sp.subscription_id
        JOIN merchant_plans mp ON mp.id = sp.plan_id
        WHERE COALESCE(sp.store_id, ms.store_id) = ${storeIdNum}
        ORDER BY sp.payment_date DESC
        LIMIT 10
      `;

      const rows = Array.isArray(payRows) ? payRows : [];
      onboardingPayments = rows.map((r) => {
        const o = r as Record<string, unknown>;
        const amount =
          typeof o.amount === "number"
            ? o.amount
            : Number((o.amount as unknown) ?? 0) || 0;
        const paymentDate = o.payment_date as unknown;
        const billingStart = o.billing_period_start as unknown;
        const billingEnd = o.billing_period_end as unknown;

        const createdIso =
          paymentDate instanceof Date
            ? paymentDate.toISOString()
            : paymentDate != null
            ? String(paymentDate)
            : "";

        const billingStartIso =
          billingStart instanceof Date
            ? billingStart.toISOString()
            : billingStart != null
            ? String(billingStart)
            : null;

        const billingEndIso =
          billingEnd instanceof Date
            ? billingEnd.toISOString()
            : billingEnd != null
            ? String(billingEnd)
            : null;

        return {
          id: o.id,
          amount_paise: Math.round(amount * 100),
          currency: "INR",
          plan_id: o.plan_id,
          plan_name: o.plan_name,
          standard_amount_paise: null,
          promo_amount_paise: null,
          promo_label: null,
          razorpay_order_id: o.payment_gateway_id ?? null,
          razorpay_payment_id: null,
          status: o.payment_status,
          payer_email: null,
          payer_phone: null,
          payer_name: null,
          created_at: createdIso,
          captured_at: createdIso,
          failed_at: null,
          failure_reason: null,
          billing_period_start: billingStartIso,
          billing_period_end: billingEndIso,
        } as Record<string, unknown>;
      });

      if (process.env.NODE_ENV !== "production") {
        console.info(
          `[verification-data] storeId=${storeId} subscription_payments=${onboardingPayments.length}`
        );
      }
    } catch (e) {
      console.warn("[verification-data] subscription_payments lookup failed:", e);
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

    return NextResponse.json({
      success: true,
      store: storePayload,
      documents,
      operatingHours,
      onboardingPayments,
      agreementAcceptance,
      menuMediaFiles,
      bankAccounts,
      assignedAreaManagers,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/verification-data]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
