import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderOnboardingCommissionConfig } from "../db/schema.js";

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

const FALLBACK: RiderOnboardingCommissionConfigDTO = {
  id: 1,
  standardOnboardingFee: "99",
  discountedOnboardingFee: "49",
  discountPercent: "50.51",
  gstPercent: "18",
  discountPeriodLabel: "for limited time",
  headline: "Onboarding Fee",
  subtitle: "Complete your onboarding by paying the registration fee",
  feeLabel: "One-time onboarding fee",
  infoMessage: "This fee covers document verification and account setup",
  alertNotice: "Pay the onboarding fee to complete registration. Your application will be reviewed after payment.",
  footerNote: "The onboarding fee is non-refundable once verification begins.",
  payButtonText: null,
  updatedAt: new Date(0).toISOString(),
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

export async function getRiderOnboardingCommissionConfig(): Promise<RiderOnboardingCommissionConfigDTO> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(riderOnboardingCommissionConfig)
      .where(eq(riderOnboardingCommissionConfig.id, SINGLETON_ID))
      .limit(1);
    const row = rows[0];
    return row ? mapRow(row) : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function parseGstPercent(config: RiderOnboardingCommissionConfigDTO): number {
  const n = Number(config.gstPercent);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, n);
}

export function computeRiderOnboardingCheckoutPaise(config: RiderOnboardingCommissionConfigDTO): {
  subtotalPaise: number;
  gstPercentApplied: number;
  gstAmountPaise: number;
  totalPaise: number;
  standardAmountPaise: number;
} {
  const discountedRupee = Number(config.discountedOnboardingFee);
  const standardRupee = Number(config.standardOnboardingFee);
  const subtotalPaise = Math.max(0, Math.round((Number.isFinite(discountedRupee) ? discountedRupee : 49) * 100));
  const standardAmountPaise = Math.max(0, Math.round((Number.isFinite(standardRupee) ? standardRupee : 99) * 100));
  const gstPercentApplied = parseGstPercent(config);
  const gstAmountPaise = Math.round((subtotalPaise * gstPercentApplied) / 100);
  const totalPaise = subtotalPaise + gstAmountPaise;
  return { subtotalPaise, gstPercentApplied, gstAmountPaise, totalPaise, standardAmountPaise };
}
