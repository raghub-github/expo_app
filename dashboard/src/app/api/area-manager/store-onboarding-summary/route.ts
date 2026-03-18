import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getMerchantStoreByIdOnly } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
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

    const storeInternalIdParam = req.nextUrl.searchParams.get("storeInternalId");
    const storeInternalId = storeInternalIdParam ? parseInt(storeInternalIdParam, 10) : NaN;
    if (!Number.isFinite(storeInternalId)) {
      return NextResponse.json({ success: false, error: "storeInternalId is required" }, { status: 400 });
    }

    const store = await getMerchantStoreByIdOnly(storeInternalId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const sql = getSql();

    // Latest captured onboarding payment for this store
    let paymentSummary: {
      amount_paise: number;
      currency: string;
      status: string;
      captured_at: string | null;
      plan_id: string | null;
      plan_name: string | null;
      promo_label: string | null;
      payer_name: string | null;
    } | null = null;

    try {
      const rows = await sql`
        SELECT amount_paise,
               currency,
               status,
               captured_at,
               plan_id,
               plan_name,
               promo_label,
               payer_name
        FROM merchant_onboarding_payments
        WHERE merchant_store_id = ${storeInternalId}
          AND status = 'captured'
        ORDER BY captured_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      `;
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row) {
        paymentSummary = {
          amount_paise: Number(row.amount_paise ?? 0),
          currency: (row.currency as string) ?? "INR",
          status: (row.status as string) ?? "captured",
          captured_at: row.captured_at ? String(row.captured_at) : null,
          plan_id: (row.plan_id as string) ?? null,
          plan_name: (row.plan_name as string) ?? null,
          promo_label: (row.promo_label as string) ?? null,
          payer_name: (row.payer_name as string) ?? null,
        };
      }
    } catch {
      // ignore; payment table may be unavailable
    }

    // Agreement acceptance details for this store
    let agreementSummary: {
      signer_name: string | null;
      signer_email: string | null;
      signer_phone: string | null;
      accepted_at: string | null;
      template_key: string | null;
      template_version: string | null;
      terms_accepted: boolean;
      contract_read_confirmed: boolean;
      contract_pdf_url: string | null;
      commission_first_month_pct: number | null;
      commission_from_second_month_pct: number | null;
      agreement_effective_from: string | null;
      agreement_effective_to: string | null;
    } | null = null;

    try {
      const rows = await sql`
        SELECT signer_name,
               signer_email,
               signer_phone,
               accepted_at,
               template_key,
               template_version,
               terms_accepted,
               contract_read_confirmed,
               contract_pdf_url,
               commission_first_month_pct,
               commission_from_second_month_pct,
               agreement_effective_from,
               agreement_effective_to
        FROM merchant_store_agreement_acceptances
        WHERE store_id = ${storeInternalId}
        ORDER BY accepted_at DESC
        LIMIT 1
      `;
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row) {
        agreementSummary = {
          signer_name: (row.signer_name as string) ?? null,
          signer_email: (row.signer_email as string) ?? null,
          signer_phone: (row.signer_phone as string) ?? null,
          accepted_at: row.accepted_at ? String(row.accepted_at) : null,
          template_key: (row.template_key as string) ?? null,
          template_version: (row.template_version as string) ?? null,
          terms_accepted: Boolean(row.terms_accepted),
          contract_read_confirmed: Boolean(row.contract_read_confirmed),
          contract_pdf_url: (row.contract_pdf_url as string) ?? null,
          commission_first_month_pct:
            row.commission_first_month_pct != null ? Number(row.commission_first_month_pct) : null,
          commission_from_second_month_pct:
            row.commission_from_second_month_pct != null
              ? Number(row.commission_from_second_month_pct)
              : null,
          agreement_effective_from: row.agreement_effective_from ? String(row.agreement_effective_from) : null,
          agreement_effective_to: row.agreement_effective_to ? String(row.agreement_effective_to) : null,
        };
      }
    } catch {
      // ignore; agreement table may be unavailable
    }

    return NextResponse.json({
      success: true,
      paymentSummary,
      agreementSummary,
    });
  } catch (e) {
    console.error("[GET /api/area-manager/store-onboarding-summary]", e);
    return NextResponse.json({ success: false, error: "Failed to load onboarding summary" }, { status: 500 });
  }
}

