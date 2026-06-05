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
  | "rental_ev";

const STEP_ORDER: (OnboardingStep | ServerOnboardingStep)[] = [
  "aadhaar_name",
  "pan_selfie",
  "dl_rc",
  "rental_ev",
];

function stepIndex(step: string): number {
  return STEP_ORDER.indexOf(step as OnboardingStep);
}

/** Prefer server progress when rider already completed earlier steps in DB. */
export function pickResumeOnboardingStep(
  localStep?: OnboardingStep,
  serverStep?: ServerOnboardingStep | null
): OnboardingStep | ServerOnboardingStep {
  if (!serverStep || serverStep === "method_selection") {
    return localStep ?? "aadhaar_name";
  }
  if (!localStep) return serverStep;

  const localIdx = stepIndex(localStep);
  const serverIdx = stepIndex(serverStep);
  if (localIdx < 0) return serverStep;
  if (serverIdx < 0) return localStep;
  return serverIdx > localIdx ? serverStep : localStep;
}

export function canAccessHome(status?: string | null, accountStatus?: string | null): boolean {
  return status === "approved" || accountStatus === "ACTIVE";
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
    accountStatus?: string | null;
  }
): `/(tabs)/orders` | `/(onboarding)/${string}` {
  if (canAccessHome(status, options?.accountStatus)) {
    return "/(tabs)/orders";
  }

  if (status === "pending_approval" || status === "rejected") {
    return "/(onboarding)/pending";
  }

  const resumeStep = pickResumeOnboardingStep(localStep, serverStep);

  const skipToPayment =
    options?.vehicleOnboardingFlow === "payment" ||
    options?.vehicleOnboardingFlow === "dl_rc" ||
    options?.vehicleChoice === "cycle" ||
    options?.vehicleChoice === "bicycle" ||
    options?.vehicleChoice === "e_cycle";
  if (skipToPayment) {
    const resumeIdx = stepIndex(resumeStep);
    const dlRcIdx = stepIndex("dl_rc");
    if (resumeIdx >= dlRcIdx && dlRcIdx >= 0) {
      return "/(onboarding)/payment";
    }
  }

  if (
    options?.vehicleOnboardingFlow === "dl_rc" &&
    (resumeStep === "rental_ev" || stepIndex(resumeStep) >= stepIndex("dl_rc"))
  ) {
    return "/(onboarding)/payment";
  }

  return onboardingStepToRoute(resumeStep);
}
