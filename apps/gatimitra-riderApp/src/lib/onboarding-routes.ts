import type { OnboardingStep } from "@/src/stores/onboardingStore";

export type RiderOnboardingStatus =
  | "not_started"
  | "in_progress"
  | "pending_approval"
  | "approved"
  | "rejected";

export type ServerOnboardingStep =
  | "method_selection"
  | "aadhaar_name"
  | "pan_selfie"
  | "dl_rc"
  | "rental_ev"
  | "bank_account"
  | "payment";

const DOC_STEP_ORDER: (OnboardingStep | ServerOnboardingStep)[] = [
  "aadhaar_name",
  "pan_selfie",
  "dl_rc",
  "rental_ev",
];

function docStepIndex(step: string): number {
  return DOC_STEP_ORDER.indexOf(step as OnboardingStep);
}

/** Legacy backend used rental_ev as the post-vehicle sentinel; completedSteps disambiguates. */
export function isVehicleOnboardingComplete(
  serverStep?: ServerOnboardingStep | null,
  completedSteps?: string[] | null,
  vehicleOnboardingFlow?: "dl_rc" | "rental_ev" | "payment"
): boolean {
  if (serverStep === "payment" || serverStep === "bank_account") return true;
  if (!completedSteps?.length) return false;

  if (vehicleOnboardingFlow === "rental_ev") {
    if (completedSteps.includes("dl_rc")) {
      return completedSteps.includes("rental_ev");
    }
    return completedSteps.includes("rental_ev");
  }
  if (vehicleOnboardingFlow === "payment") {
    return (
      completedSteps.includes("dl_rc") &&
      completedSteps.includes("rental_ev")
    );
  }
  return completedSteps.includes("dl_rc");
}

/** Macro progress bar: KYC / Vehicle / Payment — independent of server nextStep sentinel. */
export function isOnboardingVehicleDocsComplete(
  completedSteps?: string[] | null,
  vehicleOnboardingFlow?: "dl_rc" | "rental_ev" | "payment"
): boolean {
  if (!completedSteps?.length) return false;
  if (vehicleOnboardingFlow === "rental_ev") {
    if (completedSteps.includes("dl_rc")) {
      return completedSteps.includes("rental_ev");
    }
    return completedSteps.includes("rental_ev");
  }
  if (vehicleOnboardingFlow === "payment") {
    return (
      completedSteps.includes("dl_rc") &&
      completedSteps.includes("rental_ev")
    );
  }
  return completedSteps.includes("dl_rc");
}

export function resolveOnboardingMacroStepIndex(
  completedSteps?: string[] | null,
  vehicleOnboardingFlow?: "dl_rc" | "rental_ev" | "payment"
): number {
  const completed = completedSteps ?? [];
  const kycDone =
    completed.includes("aadhaar_name") && completed.includes("pan_selfie");
  if (!kycDone) return 0;
  if (!isOnboardingVehicleDocsComplete(completed, vehicleOnboardingFlow)) return 1;
  return 2;
}

export function isBankAccountOnboardingComplete(options?: {
  bankAccountOnboardingDone?: boolean | null;
}): boolean {
  return options?.bankAccountOnboardingDone === true;
}

/** First doc step that is not yet complete — used to resume after app restart. */
export function resolveFirstIncompleteOnboardingStep(
  completedSteps?: string[] | null,
  vehicleOnboardingFlow?: "dl_rc" | "rental_ev" | "payment",
  options?: {
    vehicleChoice?: string;
    vehicleOnboardingSubmittedFor?: string;
    bankAccountOnboardingDone?: boolean | null;
  }
): ServerOnboardingStep {
  const completed = completedSteps ?? [];
  if (!completed.includes("aadhaar_name")) return "aadhaar_name";
  if (!completed.includes("pan_selfie")) return "pan_selfie";
  const vehicleSubmitted =
    Boolean(options?.vehicleChoice?.trim()) &&
    options?.vehicleOnboardingSubmittedFor === options?.vehicleChoice;
  if (
    !vehicleSubmitted &&
    !isOnboardingVehicleDocsComplete(completed, vehicleOnboardingFlow)
  ) {
    return "dl_rc";
  }
  if (!vehicleSubmitted && options?.vehicleOnboardingSubmittedFor !== options?.vehicleChoice) {
    return "dl_rc";
  }
  if (!isBankAccountOnboardingComplete(options)) {
    return "bank_account";
  }
  return "payment";
}

export function canAccessOnboardingPaymentScreen(options?: {
  vehicleChoice?: string;
  vehicleOnboardingSubmittedFor?: string;
  completedOnboardingSteps?: string[] | null;
  vehicleOnboardingFlow?: "dl_rc" | "rental_ev" | "payment";
  bankAccountOnboardingDone?: boolean | null;
  /** When true, skip bank gate (legacy callers / vehicle-only checks). */
  skipBankAccountCheck?: boolean;
}): boolean {
  if (!options?.vehicleChoice?.trim()) return false;
  if (options.vehicleOnboardingSubmittedFor !== options.vehicleChoice) return false;
  if (
    !options.skipBankAccountCheck &&
    !isBankAccountOnboardingComplete(options)
  ) {
    return false;
  }
  // Prefer local vehicle-submit flag; fall back to server completed steps when present.
  const completed = options.completedOnboardingSteps;
  if (completed?.length) {
    const kycDone =
      completed.includes("aadhaar_name") && completed.includes("pan_selfie");
    if (!kycDone) return false;
    if (
      !isOnboardingVehicleDocsComplete(completed, options.vehicleOnboardingFlow) &&
      options.vehicleOnboardingFlow !== "payment"
    ) {
      return false;
    }
  }
  return true;
}

/** Vehicle docs submitted — bank screen is allowed (payment still needs bank flag). */
export function canAccessOnboardingBankAccountScreen(options?: {
  vehicleChoice?: string;
  vehicleOnboardingSubmittedFor?: string;
  completedOnboardingSteps?: string[] | null;
  vehicleOnboardingFlow?: "dl_rc" | "rental_ev" | "payment";
}): boolean {
  if (!options?.vehicleChoice?.trim()) return false;
  if (options.vehicleOnboardingSubmittedFor === options.vehicleChoice) return true;
  return canAccessOnboardingPaymentScreen({
    ...options,
    skipBankAccountCheck: true,
  });
}

function stepProgressIndex(step: ServerOnboardingStep): number {
  const order: ServerOnboardingStep[] = [
    "method_selection",
    "aadhaar_name",
    "pan_selfie",
    "dl_rc",
    "rental_ev",
    "bank_account",
    "payment",
  ];
  return order.indexOf(step);
}

export function resolveOnboardingRouteFromServer(
  serverStep?: ServerOnboardingStep | null,
  options?: {
    completedOnboardingSteps?: string[] | null;
    vehicleOnboardingFlow?: "dl_rc" | "rental_ev" | "payment";
    vehicleChoice?: string;
    vehicleOnboardingSubmittedFor?: string;
    bankAccountOnboardingDone?: boolean | null;
  }
): `/(onboarding)/${string}` | null {
  if (!serverStep || serverStep === "method_selection") return null;
  if (serverStep === "payment" || serverStep === "bank_account") {
    const completed = options?.completedOnboardingSteps ?? [];
    const kycDone =
      completed.includes("aadhaar_name") && completed.includes("pan_selfie");
    if (!kycDone) {
      return completed.includes("aadhaar_name")
        ? "/(onboarding)/pan-selfie"
        : "/(onboarding)/aadhaar";
    }
    if (
      !canAccessOnboardingBankAccountScreen({
        vehicleChoice: options?.vehicleChoice,
        vehicleOnboardingSubmittedFor: options?.vehicleOnboardingSubmittedFor,
        completedOnboardingSteps: completed,
        vehicleOnboardingFlow: options?.vehicleOnboardingFlow,
      })
    ) {
      return "/(onboarding)/dl-rc";
    }
    if (!isBankAccountOnboardingComplete(options)) {
      return "/(onboarding)/bank-account";
    }
    return "/(onboarding)/payment";
  }
  if (
    serverStep === "rental_ev" &&
    isVehicleOnboardingComplete(
      serverStep,
      options?.completedOnboardingSteps,
      options?.vehicleOnboardingFlow
    ) &&
    canAccessOnboardingBankAccountScreen({
      vehicleChoice: options?.vehicleChoice,
      vehicleOnboardingSubmittedFor: options?.vehicleOnboardingSubmittedFor,
      completedOnboardingSteps: options?.completedOnboardingSteps,
      vehicleOnboardingFlow: options?.vehicleOnboardingFlow,
    })
  ) {
    if (!isBankAccountOnboardingComplete(options)) {
      return "/(onboarding)/bank-account";
    }
    return "/(onboarding)/payment";
  }
  return onboardingStepToRoute(serverStep);
}

/** Prefer server progress when rider already completed earlier steps in DB. */
export function pickResumeOnboardingStep(
  localStep?: OnboardingStep,
  serverStep?: ServerOnboardingStep | null
): OnboardingStep | ServerOnboardingStep {
  if (serverStep === "payment" || serverStep === "bank_account") return serverStep;
  if (!serverStep || serverStep === "method_selection") {
    return localStep ?? "aadhaar_name";
  }
  if (!localStep) return serverStep;

  const localIdx = docStepIndex(localStep);
  const serverIdx = docStepIndex(serverStep);
  if (localIdx < 0) return serverStep;
  if (serverIdx < 0) return localStep;
  return serverIdx > localIdx ? serverStep : localStep;
}

export function canAccessHome(status?: string | null, accountStatus?: string | null): boolean {
  return status === "approved" || accountStatus === "ACTIVE";
}

/** Verified / post-KYC riders must not be sent back to document upload screens. */
export function resolveEstablishedRiderHref(
  onboardingStatus?: string | null,
  accountStatus?: string | null,
  _approvalStatus?: string | null,
  options?: {
    paymentCompleted?: boolean | null;
    nextOnboardingStep?: ServerOnboardingStep | null;
  },
): `/(tabs)/orders` | `/(onboarding)/${string}` | null {
  if (canAccessHome(onboardingStatus, accountStatus)) {
    return "/(tabs)/orders";
  }
  // Pending Approval only when payment is confirmed completed.
  if (onboardingStatus === "pending_approval") {
    if (options?.paymentCompleted === true) {
      return "/(onboarding)/pending";
    }
    // Unpaid / unknown payment — resume funnel (never trap on pending).
    const next = options?.nextOnboardingStep;
    if (next) return onboardingStepToRoute(next);
    if (options?.paymentCompleted === false) return "/(onboarding)/payment";
    return null;
  }
  if (onboardingStatus === "rejected") {
    return "/(onboarding)/pending";
  }
  // Do NOT map kyc/approval APPROVED + in_progress → payment.
  return null;
}

export function onboardingStepToRoute(
  step: OnboardingStep | ServerOnboardingStep
): `/(onboarding)/${string}` {
  switch (step) {
    case "aadhaar_name":
      return "/(onboarding)/aadhaar";
    case "pan_selfie":
      return "/(onboarding)/pan-selfie";
    case "dl_rc":
      return "/(onboarding)/dl-rc";
    case "rental_ev":
      return "/(onboarding)/rental-ev";
    case "bank_account":
      return "/(onboarding)/bank-account";
    case "payment":
      return "/(onboarding)/payment";
    case "method_selection":
      // Method-selection UI removed — policy drives Cashfree vs manual on Aadhaar step.
      return "/(onboarding)/aadhaar";
    default:
      return "/(onboarding)/aadhaar";
  }
}

/**
 * True when server says the rider should be on a later step than `currentScreenStep`.
 * Used so completed screens (e.g. Aadhaar) forward to the next incomplete step.
 */
export function shouldForwardFromOnboardingScreen(
  currentScreenStep: ServerOnboardingStep,
  nextServerStep?: ServerOnboardingStep | null,
): nextServerStep is ServerOnboardingStep {
  if (!nextServerStep) return false;
  if (nextServerStep === currentScreenStep) return false;
  if (nextServerStep === "method_selection") return false;

  const order: ServerOnboardingStep[] = [
    "method_selection",
    "aadhaar_name",
    "pan_selfie",
    "dl_rc",
    "rental_ev",
    "bank_account",
    "payment",
  ];
  const cur = order.indexOf(currentScreenStep);
  const next = order.indexOf(nextServerStep);
  if (cur < 0 || next < 0) return nextServerStep !== currentScreenStep;
  return next > cur;
}

/**
 * First docs screen after OTP for brand-new riders.
 * Referral UI is shown when Super Admin "Rider Referral" is on; the referral
 * screen itself redirects to Aadhaar when the service is off. Once the rider
 * has handled the prompt (or already started KYC), go straight to Aadhaar.
 */
export function resolveNewRiderDocsEntryHref(options?: {
  referralPromptHandled?: boolean | null;
  completedOnboardingSteps?: string[] | null;
}): `/(onboarding)/referral` | `/(onboarding)/aadhaar` {
  const completed = options?.completedOnboardingSteps ?? [];
  if (completed.includes("aadhaar_name") || options?.referralPromptHandled === true) {
    return "/(onboarding)/aadhaar";
  }
  return "/(onboarding)/referral";
}

export function resolveOnboardingHref(
  status?: string | null,
  localStep?: OnboardingStep,
  serverStep?: ServerOnboardingStep | null,
  options?: {
    vehicleChoice?: string;
    vehicleOnboardingFlow?: "dl_rc" | "rental_ev" | "payment";
    vehicleOnboardingSubmittedFor?: string;
    bankAccountOnboardingDone?: boolean | null;
    accountStatus?: string | null;
    completedOnboardingSteps?: string[] | null;
    approvalStatus?: string | null;
    paymentCompleted?: boolean | null;
    referralPromptHandled?: boolean | null;
  }
): `/(tabs)/orders` | `/(onboarding)/${string}` {
  const establishedHref = resolveEstablishedRiderHref(
    status,
    options?.accountStatus,
    options?.approvalStatus,
    {
      paymentCompleted: options?.paymentCompleted,
      nextOnboardingStep: serverStep,
    },
  );
  if (establishedHref) return establishedHref;

  // Only stay on pending when payment is confirmed.
  if (status === "pending_approval" && options?.paymentCompleted === true) {
    return "/(onboarding)/pending";
  }
  if (status === "rejected") {
    return "/(onboarding)/pending";
  }

  const serverRoute = resolveOnboardingRouteFromServer(serverStep, {
    completedOnboardingSteps: options?.completedOnboardingSteps,
    vehicleOnboardingFlow: options?.vehicleOnboardingFlow,
    vehicleChoice: options?.vehicleChoice,
    vehicleOnboardingSubmittedFor: options?.vehicleOnboardingSubmittedFor,
    bankAccountOnboardingDone: options?.bankAccountOnboardingDone,
  });

  const completed = options?.completedOnboardingSteps ?? [];
  if (completed.length > 0) {
    const resumeStep = resolveFirstIncompleteOnboardingStep(
      completed,
      options?.vehicleOnboardingFlow,
      {
        vehicleChoice: options?.vehicleChoice,
        vehicleOnboardingSubmittedFor: options?.vehicleOnboardingSubmittedFor,
        bankAccountOnboardingDone: options?.bankAccountOnboardingDone,
      }
    );
    const resumeRoute = onboardingStepToRoute(resumeStep);
    if (!serverStep || serverStep === "method_selection") {
      return resumeRoute;
    }
    const serverIdx = stepProgressIndex(serverStep);
    const resumeIdx = stepProgressIndex(resumeStep);
    if (resumeIdx > serverIdx) {
      return resumeRoute;
    }
  }

  // Brand-new rider (no KYC progress yet): optional referral prompt before Aadhaar.
  // The referral screen self-gates on Super Admin rider_referral_enabled.
  if (
    !completed.includes("aadhaar_name") &&
    options?.referralPromptHandled !== true &&
    (!serverStep ||
      serverStep === "method_selection" ||
      serverStep === "aadhaar_name")
  ) {
    return "/(onboarding)/referral";
  }

  if (serverRoute) return serverRoute;

  if (localStep) {
    return onboardingStepToRoute(localStep);
  }

  return resolveNewRiderDocsEntryHref({
    referralPromptHandled: options?.referralPromptHandled,
    completedOnboardingSteps: options?.completedOnboardingSteps,
  });
}
