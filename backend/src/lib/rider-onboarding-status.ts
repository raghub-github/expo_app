import { getDb } from "../db/client.js";
import { riders, onboardingPayments } from "../db/schema.js";
import { desc, eq } from "drizzle-orm";
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

export async function hasCompletedOnboardingPayment(riderId: number): Promise<boolean> {
  const db = getDb();
  const [payment] = await db
    .select({ status: onboardingPayments.status })
    .from(onboardingPayments)
    .where(eq(onboardingPayments.riderId, riderId))
    .orderBy(desc(onboardingPayments.createdAt))
    .limit(1);
  return payment?.status === "completed";
}

export function mapRiderToAppOnboardingStatus(
  rider: {
    onboardingStage: string;
    status: string;
    kycStatus: string;
  },
  opts?: { paymentCompleted?: boolean | null },
): AppOnboardingStatus {
  if (rider.status === "ACTIVE") {
    return "approved";
  }
  if (rider.kycStatus === "REJECTED") {
    return "rejected";
  }
  const mapped = ONBOARDING_STATUS_MAP[rider.onboardingStage] ?? "not_started";
  // Never expose Pending Approval until onboarding payment is completed.
  if (mapped === "pending_approval" && opts?.paymentCompleted !== true) {
    return "in_progress";
  }
  return mapped;
}

export type ResolveRiderOnboardingStatusOptions = {
  /**
   * When false, skip the heavy activation sync on this request (used by status polling).
   * Activation still runs in the background when false.
   */
  syncActivation?: boolean;
  /** When true (default), demote unpaid APPROVAL → in_progress for the app. */
  requirePaymentForPendingApproval?: boolean;
};

/** Sync activation when eligible, then return latest rider + app-facing statuses. */
export async function resolveRiderOnboardingStatusForApp(
  riderId: number,
  options?: ResolveRiderOnboardingStatusOptions,
): Promise<{
  rider: typeof riders.$inferSelect;
  onboardingStatus: AppOnboardingStatus;
  approvalStatus: string;
  paymentCompleted: boolean;
} | null> {
  const db = getDb();

  if (options?.syncActivation !== false) {
    try {
      await tryActivateRiderIfEligible(riderId);
    } catch {
      // Pool timeouts must not block status/profile reads.
    }
  }

  let [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
  if (!rider) return null;

  const paymentCompleted = await hasCompletedOnboardingPayment(riderId);

  // Self-heal illegal APPROVAL-without-payment so login/status stay consistent.
  if (rider.onboardingStage === "APPROVAL" && !paymentCompleted && rider.status !== "ACTIVE") {
    try {
      const { getRiderOnboardingProgress } = await import("./rider-onboarding-progress.js");
      await getRiderOnboardingProgress(riderId);
      const [refreshed] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
      if (refreshed) rider = refreshed;
    } catch {
      // Progress heal is best-effort.
    }
  }

  const requirePayment = options?.requirePaymentForPendingApproval !== false;

  return {
    rider,
    onboardingStatus: mapRiderToAppOnboardingStatus(
      rider,
      requirePayment ? { paymentCompleted } : undefined,
    ),
    approvalStatus: APPROVAL_STATUS_MAP[rider.kycStatus] ?? "DRAFT",
    paymentCompleted,
  };
}
