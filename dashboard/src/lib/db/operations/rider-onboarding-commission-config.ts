import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { riderOnboardingCommissionConfig } from "../schema";

const SINGLETON_ID = 1 as const;

export type RiderOnboardingCommissionConfigDTO = {
  id: number;
  standardOnboardingFee: string;
  discountedOnboardingFee: string;
  discountPercent: string;
  gstPercent: string;
  discountPeriodLabel: string;
  headline: string;
  subtitle: string;
  feeLabel: string;
  infoMessage: string;
  alertNotice: string;
  footerNote: string;
  payButtonText: string | null;
  updatedAt: string;
};

function mapRow(row: typeof riderOnboardingCommissionConfig.$inferSelect): RiderOnboardingCommissionConfigDTO {
  return {
    id: row.id,
    standardOnboardingFee: String(row.standardOnboardingFee),
    discountedOnboardingFee: String(row.discountedOnboardingFee),
    discountPercent: String(row.discountPercent),
    gstPercent: String(row.gstPercent ?? "0"),
    discountPeriodLabel: row.discountPeriodLabel,
    headline: row.headline,
    subtitle: row.subtitle,
    feeLabel: row.feeLabel,
    infoMessage: row.infoMessage,
    alertNotice: row.alertNotice,
    footerNote: row.footerNote,
    payButtonText: row.payButtonText ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getRiderOnboardingCommissionConfig(): Promise<RiderOnboardingCommissionConfigDTO | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(riderOnboardingCommissionConfig)
    .where(eq(riderOnboardingCommissionConfig.id, SINGLETON_ID))
    .limit(1);
  const row = rows[0];
  return row ? mapRow(row) : null;
}

export type RiderOnboardingCommissionConfigUpdate = {
  standardOnboardingFee: string;
  discountedOnboardingFee: string;
  discountPercent: string;
  gstPercent: string;
  discountPeriodLabel: string;
  headline: string;
  subtitle: string;
  feeLabel: string;
  infoMessage: string;
  alertNotice: string;
  footerNote: string;
  payButtonText: string | null;
};

export async function updateRiderOnboardingCommissionConfig(
  patch: RiderOnboardingCommissionConfigUpdate
): Promise<RiderOnboardingCommissionConfigDTO> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(riderOnboardingCommissionConfig)
    .set({
      standardOnboardingFee: patch.standardOnboardingFee,
      discountedOnboardingFee: patch.discountedOnboardingFee,
      discountPercent: patch.discountPercent,
      gstPercent: patch.gstPercent,
      discountPeriodLabel: patch.discountPeriodLabel,
      headline: patch.headline,
      subtitle: patch.subtitle,
      feeLabel: patch.feeLabel,
      infoMessage: patch.infoMessage,
      alertNotice: patch.alertNotice,
      footerNote: patch.footerNote,
      payButtonText: patch.payButtonText,
      updatedAt: now,
    })
    .where(eq(riderOnboardingCommissionConfig.id, SINGLETON_ID))
    .returning();
  if (!row) {
    throw new Error("rider_onboarding_commission_config row missing; run migration 0254");
  }
  return mapRow(row);
}
