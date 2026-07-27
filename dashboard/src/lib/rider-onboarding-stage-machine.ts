/**
 * Canonical rider onboarding stage transitions (dashboard copy).
 * Keep in sync with backend/src/lib/rider-onboarding-stage-machine.ts
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
  identitySubmitted: boolean;
  identityVerified: boolean;
  vehicleReady: boolean;
  vehicleVerified: boolean;
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

  if (currentStatus === "ACTIVE" || currentStage === "ACTIVE") {
    return {
      onboardingStage: "ACTIVE",
      kycStatus: "APPROVED",
      status: "ACTIVE",
      changed: currentStage !== "ACTIVE" || currentStatus !== "ACTIVE" || currentKyc !== "APPROVED",
    };
  }

  const allDocsVerified = input.identityVerified && input.vehicleVerified;
  const docsReadyForPayment = input.identitySubmitted && input.vehicleReady;

  let nextStage: OnboardingStage = currentStage;
  let nextKyc: KycStatus = currentKyc;
  let nextStatus = currentStatus;

  if (input.paymentCompleted && allDocsVerified) {
    nextStage = "ACTIVE";
    nextKyc = "APPROVED";
    nextStatus = "ACTIVE";
  } else if (input.paymentCompleted) {
    nextStage = "APPROVAL";
    if (allDocsVerified) nextKyc = "APPROVED";
    else if (nextKyc === "PENDING" && input.identityVerified) nextKyc = "APPROVED";
  } else if (docsReadyForPayment || allDocsVerified) {
    nextStage = "PAYMENT";
    if (allDocsVerified) nextKyc = "APPROVED";
    else if (input.identityVerified && nextKyc === "PENDING") nextKyc = "APPROVED";
  } else if (input.identitySubmitted || input.identityVerified || currentStage !== "MOBILE_VERIFIED") {
    nextStage = "KYC";
    if (nextKyc === "APPROVED" && !input.identityVerified) {
      nextKyc = "PENDING";
    }
  } else {
    nextStage = "MOBILE_VERIFIED";
  }

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
      nextRequiredStep = key;
      break;
    }
    if (
      !nextRequiredStep &&
      (s === "in_progress" || s === "failed" || s === "pending_manual_review")
    ) {
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

export function resolveMacroStepIndexFromProgress(progress: OnboardingProgressMap): number {
  const kycDone =
    (progress.aadhaar === "completed" || progress.aadhaar === "pending_manual_review") &&
    (progress.face === "completed" || progress.face === "pending_manual_review") &&
    (progress.pan === "completed" ||
      progress.pan === "skipped" ||
      progress.pan === "pending_manual_review");
  if (!kycDone) return 0;
  if (progress.vehicle !== "completed" && progress.vehicle !== "pending_manual_review") return 1;
  if (progress.payment !== "completed") return 2;
  return 3;
}
