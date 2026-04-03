/**
 * Singleton row in public.store_onboarding_commission_config (id = 1).
 * Shared with dashboard super admin; partnersite reads for register-store step 7.
 */
import { client } from "@/lib/drizzle";

export type StoreOnboardingCommissionConfigDTO = {
  id: number;
  planName: string;
  showRecommendedBadge: boolean;
  standardOnboardingFee: string;
  discountedOnboardingFee: string;
  discountPercent: string;
  baseServiceFeePercent: string;
  gstPercent: string;
  discountPeriodLabel: string;
  baseServiceFeePeriodLabel: string;
  features: string[];
  alertNotice: string;
  footerNote: string;
  supportContact: string;
  payButtonText: string | null;
  updatedAt: string;
};

function parseFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

export async function getStoreOnboardingCommissionConfig(): Promise<StoreOnboardingCommissionConfigDTO | null> {
  try {
    const rows = await client`
      SELECT
        id,
        plan_name,
        show_recommended_badge,
        standard_onboarding_fee,
        discounted_onboarding_fee,
        discount_percent,
        base_service_fee_percent,
        gst_percent,
        discount_period_label,
        base_service_fee_period_label,
        features,
        alert_notice,
        footer_note,
        support_contact,
        pay_button_text,
        updated_at
      FROM store_onboarding_commission_config
      WHERE id = 1
      LIMIT 1
    `;
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: Number(row.id),
      planName: String(row.plan_name ?? ""),
      showRecommendedBadge: Boolean(row.show_recommended_badge),
      standardOnboardingFee: String(row.standard_onboarding_fee ?? "0"),
      discountedOnboardingFee: String(row.discounted_onboarding_fee ?? "0"),
      discountPercent: String(row.discount_percent ?? "0"),
      baseServiceFeePercent: String(row.base_service_fee_percent ?? "0"),
      gstPercent: String(row.gst_percent ?? "0"),
      discountPeriodLabel: String(row.discount_period_label ?? ""),
      baseServiceFeePeriodLabel: String(row.base_service_fee_period_label ?? ""),
      features: parseFeatures(row.features),
      alertNotice: String(row.alert_notice ?? ""),
      footerNote: String(row.footer_note ?? ""),
      supportContact: String(row.support_contact ?? ""),
      payButtonText: row.pay_button_text != null ? String(row.pay_button_text) : null,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at ?? ""),
    };
  } catch (e) {
    console.error("[getStoreOnboardingCommissionConfig]", e);
    return null;
  }
}
