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
  if (serverStep === "payment") return true;
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
      completedSteps.includes("dl_rc") && completedSteps.includes("rental_ev")
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

/** First doc step that is not yet complete — used to resume after app restart. */
export function resolveFirstIncompleteOnboardingStep(
  completedSteps?: string[] | null,
  vehicleOnboardingFlow?: "dl_rc" | "rental_ev" | "payment",
  options?: {
    vehicleChoice?: string;
    vehicleOnboardingSubmittedFor?: string;
  }
): ServerOnboardingStep {
  const completed = completedSteps ?? [];
  if (!completed.includes("aadhaar_name")) return "aadhaar_name";
  if (!completed.includes("pan_selfie")) return "pan_selfie";
  if (!isOnboardingVehicleDocsComplete(completed, vehicleOnboardingFlow)) {
    return "dl_rc";
  }
  if (options?.vehicleOnboardingSubmittedFor !== options?.vehicleChoice) {
    return "dl_rc";
  }
  return "payment";
}

export function canAccessOnboardingPaymentScreen(options?: {
  vehicleChoice?: string;
  vehicleOnboardingSubmittedFor?: string;
  completedOnboardingSteps?: string[] | null;
  vehicleOnboardingFlow?: "dl_rc" | "rental_ev" | "payment";
}): boolean {
  if (!options?.vehicleChoice?.trim()) return false;
  if (options.vehicleOnboardingSubmittedFor !== options.vehicleChoice) return false;
  const completed = options.completedOnboardingSteps ?? [];
  const kycDone =
    completed.includes("aadhaar_name") && completed.includes("pan_selfie");
  if (!kycDone) return false;
  return isOnboardingVehicleDocsComplete(completed, options.vehicleOnboardingFlow);
}

function stepProgressIndex(step: ServerOnboardingStep): number {
  const order: ServerOnboardingStep[] = [
    "method_selection",
    "aadhaar_name",
    "pan_selfie",
    "dl_rc",
    "rental_ev",
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
  }
): `/(onboarding)/${string}` | null {
  if (!serverStep || serverStep === "method_selection") return null;
  if (serverStep === "payment") {
    const completed = options?.completedOnboardingSteps ?? [];
    const kycDone =
      completed.includes("aadhaar_name") && completed.includes("pan_selfie");
    if (!kycDone) {
      return completed.includes("aadhaar_name")
        ? "/(onboarding)/pan-selfie"
        : "/(onboarding)/aadhaar";
    }
    if (
      !canAccessOnboardingPaymentScreen({
        vehicleChoice: options?.vehicleChoice,
        vehicleOnboardingSubmittedFor: options?.vehicleOnboardingSubmittedFor,
        completedOnboardingSteps: completed,
        vehicleOnboardingFlow: options?.vehicleOnboardingFlow,
      })
    ) {
      return "/(onboarding)/dl-rc";
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
    canAccessOnboardingPaymentScreen({
      vehicleChoice: options?.vehicleChoice,
      vehicleOnboardingSubmittedFor: options?.vehicleOnboardingSubmittedFor,
      completedOnboardingSteps: options?.completedOnboardingSteps,
      vehicleOnboardingFlow: options?.vehicleOnboardingFlow,
    })
  ) {
    return "/(onboarding)/payment";
  }
  return onboardingStepToRoute(serverStep);
}

/** Prefer server progress when rider already completed earlier steps in DB. */
export function pickResumeOnboardingStep(
  localStep?: OnboardingStep,
  serverStep?: ServerOnboardingStep | null
): OnboardingStep | ServerOnboardingStep {
  if (serverStep === "payment") return "payment";
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
  approvalStatus?: string | null,
): `/(tabs)/orders` | `/(onboarding)/${string}` | null {
  if (canAccessHome(onboardingStatus, accountStatus)) {
    return "/(tabs)/orders";
  }
  if (onboardingStatus === "pending_approval" || onboardingStatus === "rejected") {
    return "/(onboarding)/pending";
  }
  if (approvalStatus === "APPROVED" && onboardingStatus === "in_progress") {
    return "/(onboarding)/payment";
  }
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
    case "payment":
      return "/(onboarding)/payment";
    default:
      return "/(onboarding)/method-selection";
  }
}

export function resolveOnboardingHref(
  status?: string | null,
  localStep?: OnboardingStep,
  serverStep?: ServerOnboardingStep | null,
  options?: {
    vehicleChoice?: string;
    vehicleOnboardingFlow?: "dl_rc" | "rental_ev" | "payment";
    vehicleOnboardingSubmittedFor?: string;
    accountStatus?: string | null;
    completedOnboardingSteps?: string[] | null;
    approvalStatus?: string | null;
  }
): `/(tabs)/orders` | `/(onboarding)/${string}` {
  const establishedHref = resolveEstablishedRiderHref(
    status,
    options?.accountStatus,
    options?.approvalStatus,
  );
  if (establishedHref) return establishedHref;

  if (status === "pending_approval" || status === "rejected") {
    return "/(onboarding)/pending";
  }

  const serverRoute = resolveOnboardingRouteFromServer(serverStep, {
    completedOnboardingSteps: options?.completedOnboardingSteps,
    vehicleOnboardingFlow: options?.vehicleOnboardingFlow,
    vehicleChoice: options?.vehicleChoice,
    vehicleOnboardingSubmittedFor: options?.vehicleOnboardingSubmittedFor,
  });

  const completed = options?.completedOnboardingSteps ?? [];
  if (completed.length > 0) {
    const resumeStep = resolveFirstIncompleteOnboardingStep(
      completed,
      options?.vehicleOnboardingFlow,
      {
        vehicleChoice: options?.vehicleChoice,
        vehicleOnboardingSubmittedFor: options?.vehicleOnboardingSubmittedFor,
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

  if (serverRoute) return serverRoute;

  if (localStep) {
    return onboardingStepToRoute(localStep);
  }

  return "/(onboarding)/aadhaar";
}
