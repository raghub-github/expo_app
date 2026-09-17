/**
 * Canonical rider onboarding stage transitions.
 * APPROVAL is only entered after onboarding payment is completed.
 * Identity-only verification must never jump to APPROVAL.
 */

export type OnboardingStage =
  | "MOBILE_VERIFIED"
  | "KYC"
  | "PAYMENT"
  | "APPROVAL"
  | "ACTIVE";

export type KycStatus = "PENDING" | "REJECTED" | "APPROVED" | "REVIEW";

export type OnboardingStepStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "failed"
  | "pending_manual_review"
  | "skipped";

export type OnboardingProgressMap = {
  aadhaar: OnboardingStepStatus;
  face: OnboardingStepStatus;
  pan: OnboardingStepStatus;
  vehicle: OnboardingStepStatus;
  payment: OnboardingStepStatus;
  approval: OnboardingStepStatus;
};

export type StageMachineInput = {
  currentStage: OnboardingStage | string;
  currentKyc: KycStatus | string;
  currentStatus: string;
  /** Aadhaar + selfie present (verified or pending manual review). */
  identitySubmitted: boolean;
  /** Identity docs fully verified. */
  identityVerified: boolean;
  /** Vehicle docs submitted for current choice (ready to pay). */
  vehicleReady: boolean;
  /** Vehicle docs fully verified. */
  vehicleVerified: boolean;
  /** onboarding_payments.status === completed */
  paymentCompleted: boolean;
};

export type StageMachineResult = {
  onboardingStage: OnboardingStage;
  kycStatus: KycStatus;
  status: string;
  changed: boolean;
};

const STAGE_ORDER: OnboardingStage[] = [
  "MOBILE_VERIFIED",
  "KYC",
  "PAYMENT",
  "APPROVAL",
  "ACTIVE",
];

function asStage(value: string): OnboardingStage {
  if (STAGE_ORDER.includes(value as OnboardingStage)) return value as OnboardingStage;
  return "MOBILE_VERIFIED";
}

function asKyc(value: string): KycStatus {
  if (value === "APPROVED" || value === "REJECTED" || value === "REVIEW" || value === "PENDING") {
    return value;
  }
  return "PENDING";
}

/**
 * Resolve the next persisted rider stage/kyc/status.
 * Never sets APPROVAL without paymentCompleted.
 * Never sets ACTIVE / KYC APPROVED until identity + vehicle docs are fully verified
 * (skipped optional docs do not count as pending).
 */
export function resolveRiderOnboardingStageTransition(
  input: StageMachineInput,
): StageMachineResult {
  const currentStage = asStage(String(input.currentStage || "MOBILE_VERIFIED"));
  const currentKyc = asKyc(String(input.currentKyc || "PENDING"));
  const currentStatus = String(input.currentStatus || "INACTIVE");

  if (currentStatus === "BLOCKED" || currentStatus === "BANNED") {
    return {
      onboardingStage: currentStage,
      kycStatus: currentKyc,
      status: currentStatus,
      changed: false,
    };
  }

  const allDocsVerified = input.identityVerified && input.vehicleVerified;
  const docsReadyForPayment = input.identitySubmitted && input.vehicleReady;

  // Wrongly activated while onboarding docs still need manual review → demote.
  if ((currentStatus === "ACTIVE" || currentStage === "ACTIVE") && !allDocsVerified) {
    if (input.paymentCompleted) {
      return {
        onboardingStage: "APPROVAL",
        kycStatus: currentKyc === "REJECTED" ? "REJECTED" : "REVIEW",
        status: "INACTIVE",
        changed: true,
      };
    }
    return {
      onboardingStage: docsReadyForPayment ? "PAYMENT" : "KYC",
      kycStatus: currentKyc === "REJECTED" ? "REJECTED" : "PENDING",
      status: "INACTIVE",
      changed: true,
    };
  }

  if (currentStatus === "ACTIVE" || currentStage === "ACTIVE") {
    return {
      onboardingStage: "ACTIVE",
      kycStatus: "APPROVED",
      status: "ACTIVE",
      changed: currentStage !== "ACTIVE" || currentStatus !== "ACTIVE" || currentKyc !== "APPROVED",
    };
  }

  let nextStage: OnboardingStage = currentStage;
  let nextKyc: KycStatus = currentKyc;
  let nextStatus = currentStatus === "ACTIVE" ? "INACTIVE" : currentStatus;

  if (input.paymentCompleted && allDocsVerified) {
    nextStage = "ACTIVE";
    nextKyc = "APPROVED";
    nextStatus = "ACTIVE";
  } else if (input.paymentCompleted) {
    // Paid — approval queue until every submitted (non-skipped) doc is verified.
    nextStage = "APPROVAL";
    nextStatus = "INACTIVE";
    if (currentKyc === "REJECTED") nextKyc = "REJECTED";
    else nextKyc = "REVIEW";
  } else if (docsReadyForPayment || allDocsVerified) {
    nextStage = "PAYMENT";
    nextStatus = "INACTIVE";
    if (allDocsVerified) nextKyc = "APPROVED";
    else if (currentKyc === "REJECTED") nextKyc = "REJECTED";
    else if (input.identityVerified) nextKyc = "REVIEW";
    else nextKyc = "PENDING";
  } else if (input.identitySubmitted || input.identityVerified || currentStage !== "MOBILE_VERIFIED") {
    nextStage = "KYC";
    nextStatus = "INACTIVE";
    if (nextKyc === "APPROVED" && !allDocsVerified) {
      nextKyc = input.identityVerified ? "REVIEW" : "PENDING";
    }
  } else {
    nextStage = "MOBILE_VERIFIED";
    nextStatus = "INACTIVE";
  }

  // Heal illegal APPROVAL-without-payment (legacy bug).
  if (nextStage === "APPROVAL" && !input.paymentCompleted) {
    nextStage = docsReadyForPayment || allDocsVerified ? "PAYMENT" : "KYC";
  }

  const changed =
    nextStage !== currentStage || nextKyc !== currentKyc || nextStatus !== currentStatus;

  return {
    onboardingStage: nextStage,
    kycStatus: nextKyc,
    status: nextStatus,
    changed,
  };
}

/** Client may only request these transitions via update-stage. */
export function isAllowedClientStageTransition(
  from: string,
  to: string,
  opts?: { docsReadyForPayment?: boolean },
): boolean {
  if (to === "APPROVAL" || to === "ACTIVE") return false;
  if (from === to) return true;
  if (from === "MOBILE_VERIFIED" && to === "KYC") return true;
  if (from === "KYC" && to === "PAYMENT") return opts?.docsReadyForPayment === true;
  if (from === "PAYMENT" && to === "KYC") return true; // allow going back while unpaid
  return false;
}

export function computeOnboardingProgressPct(progress: OnboardingProgressMap): number {
  const keys: (keyof OnboardingProgressMap)[] = [
    "aadhaar",
    "face",
    "pan",
    "vehicle",
    "payment",
    "approval",
  ];
  const done = keys.filter((k) => {
    const s = progress[k];
    return s === "completed" || s === "skipped";
  }).length;
  return Math.round((done / keys.length) * 100);
}

export function resolveLastAndNextProgressSteps(progress: OnboardingProgressMap): {
  lastCompletedStep: string | null;
  nextRequiredStep: string | null;
} {
  const order: (keyof OnboardingProgressMap)[] = [
    "aadhaar",
    "face",
    "pan",
    "vehicle",
    "payment",
    "approval",
  ];
  let lastCompletedStep: string | null = null;
  let nextRequiredStep: string | null = null;
  for (const key of order) {
    const s = progress[key];
    if (s === "completed" || s === "skipped") {
      lastCompletedStep = key;
      continue;
    }
    if (!nextRequiredStep && key !== "pan") {
      // pan is optional — skip as required unless in_progress/failed
      nextRequiredStep = key;
      break;
    }
    if (!nextRequiredStep && (s === "in_progress" || s === "failed" || s === "pending_manual_review")) {
      nextRequiredStep = key;
      break;
    }
  }
  if (!nextRequiredStep) {
    for (const key of order) {
      const s = progress[key];
      if (s !== "completed" && s !== "skipped") {
        nextRequiredStep = key;
        break;
      }
    }
  }
  return { lastCompletedStep, nextRequiredStep };
}

/** Macro bar index: 0 KYC, 1 Vehicle, 2 Payment, 3 Approval */
export function resolveMacroStepIndexFromProgress(progress: OnboardingProgressMap): number {
  const kycDone =
    (progress.aadhaar === "completed" || progress.aadhaar === "pending_manual_review") &&
    (progress.face === "completed" || progress.face === "pending_manual_review") &&
    (progress.pan === "completed" || progress.pan === "skipped" || progress.pan === "pending_manual_review");
  if (!kycDone) return 0;
  if (progress.vehicle !== "completed" && progress.vehicle !== "pending_manual_review") return 1;
  if (progress.payment !== "completed") return 2;
  return 3;
}

/** Admin approval queue: paid + identity/vehicle submitted (verified or pending review). */
export function isEligibleForApprovalQueue(input: {
  paymentCompleted: boolean;
  identitySubmitted: boolean;
  vehicleReady: boolean;
  onboardingStage?: string;
}): boolean {
  if (!input.paymentCompleted) return false;
  if (!input.identitySubmitted || !input.vehicleReady) return false;
  const stage = String(input.onboardingStage || "");
  // Paid + docs only; ACTIVE riders are already live (not in the queue).
  return stage === "APPROVAL";
}
