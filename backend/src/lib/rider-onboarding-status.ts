import { getDb } from "../db/client.js";
import { riders } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { tryActivateRiderIfEligible } from "./rider-onboarding-activation.js";

export type AppOnboardingStatus =
  | "not_started"
  | "in_progress"
  | "pending_approval"
  | "approved"
  | "rejected";

const ONBOARDING_STATUS_MAP: Record<string, AppOnboardingStatus> = {
  MOBILE_VERIFIED: "not_started",
  KYC: "in_progress",
  PAYMENT: "in_progress",
  APPROVAL: "pending_approval",
  ACTIVE: "approved",
};

const APPROVAL_STATUS_MAP: Record<string, string> = {
  PENDING: "DRAFT",
  REVIEW: "DRAFT",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

export function mapRiderToAppOnboardingStatus(rider: {
  onboardingStage: string;
  status: string;
  kycStatus: string;
}): AppOnboardingStatus {
  if (rider.status === "ACTIVE") {
    return "approved";
  }
  if (rider.kycStatus === "REJECTED") {
    return "rejected";
  }
  return ONBOARDING_STATUS_MAP[rider.onboardingStage] ?? "not_started";
}

export type ResolveRiderOnboardingStatusOptions = {
  /**
   * When false, skip the heavy activation sync on this request (used by status polling).
   * Activation still runs in the background when false.
   */
  syncActivation?: boolean;
};

/** Sync activation when eligible, then return latest rider + app-facing statuses. */
export async function resolveRiderOnboardingStatusForApp(
  riderId: number,
  options?: ResolveRiderOnboardingStatusOptions,
): Promise<{
  rider: typeof riders.$inferSelect;
  onboardingStatus: AppOnboardingStatus;
  approvalStatus: string;
} | null> {
  const db = getDb();

  if (options?.syncActivation !== false) {
    try {
      await tryActivateRiderIfEligible(riderId);
    } catch {
      // Pool timeouts must not block status/profile reads.
    }
  }

  const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
  if (!rider) return null;

  return {
    rider,
    onboardingStatus: mapRiderToAppOnboardingStatus(rider),
    approvalStatus: APPROVAL_STATUS_MAP[rider.kycStatus] ?? "DRAFT",
  };
}
