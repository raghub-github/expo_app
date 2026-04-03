import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { storeOnboardingCommissionConfig } from "../schema";

const SINGLETON_ID = 1 as const;

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

function mapRow(row: typeof storeOnboardingCommissionConfig.$inferSelect): StoreOnboardingCommissionConfigDTO {
  return {
    id: row.id,
    planName: row.planName,
    showRecommendedBadge: row.showRecommendedBadge,
    standardOnboardingFee: String(row.standardOnboardingFee),
    discountedOnboardingFee: String(row.discountedOnboardingFee),
    discountPercent: String(row.discountPercent),
    baseServiceFeePercent: String(row.baseServiceFeePercent),
    gstPercent: String(row.gstPercent ?? "0"),
    discountPeriodLabel: row.discountPeriodLabel,
    baseServiceFeePeriodLabel: row.baseServiceFeePeriodLabel,
    features: parseFeatures(row.features),
    alertNotice: row.alertNotice,
    footerNote: row.footerNote,
    supportContact: row.supportContact,
    payButtonText: row.payButtonText ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getStoreOnboardingCommissionConfig(): Promise<StoreOnboardingCommissionConfigDTO | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(storeOnboardingCommissionConfig)
    .where(eq(storeOnboardingCommissionConfig.id, SINGLETON_ID))
    .limit(1);
  const row = rows[0];
  return row ? mapRow(row) : null;
}

export type StoreOnboardingCommissionConfigUpdate = {
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
};

export async function updateStoreOnboardingCommissionConfig(
  patch: StoreOnboardingCommissionConfigUpdate
): Promise<StoreOnboardingCommissionConfigDTO> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(storeOnboardingCommissionConfig)
    .set({
      planName: patch.planName,
      showRecommendedBadge: patch.showRecommendedBadge,
      standardOnboardingFee: patch.standardOnboardingFee,
      discountedOnboardingFee: patch.discountedOnboardingFee,
      discountPercent: patch.discountPercent,
      baseServiceFeePercent: patch.baseServiceFeePercent,
      gstPercent: patch.gstPercent,
      discountPeriodLabel: patch.discountPeriodLabel,
      baseServiceFeePeriodLabel: patch.baseServiceFeePeriodLabel,
      features: patch.features,
      alertNotice: patch.alertNotice,
      footerNote: patch.footerNote,
      supportContact: patch.supportContact,
      payButtonText: patch.payButtonText,
      updatedAt: now,
    })
    .where(eq(storeOnboardingCommissionConfig.id, SINGLETON_ID))
    .returning();
  if (!row) {
    throw new Error("store_onboarding_commission_config row missing; run migration 0189");
  }
  return mapRow(row);
}
