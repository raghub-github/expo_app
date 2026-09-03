/**
 * Pure ONBOARDING decision — the single place that turns "identity + vehicle + per-service
 * eligibility + payment + zero-eligibility policy" into the onboarding status the whole
 * system uses (§6, §8, §26, §33, §34). It deliberately separates the THREE states the spec
 * insists on:
 *   A. ONBOARDING COMPLETION  (this function's `status`)
 *   B. DOCUMENT VERIFICATION  (per-doc lifecycle, resolved elsewhere)
 *   C. SERVICE ELIGIBILITY    (the engine decision per service, fed in here)
 *
 * Key rule (MOST IMPORTANT): a rider is NOT blocked from completing onboarding merely
 * because an OPTIONAL document is missing. Onboarding completes with identity verified,
 * payment done, and at least one eligible service (or zero if policy allows) — while
 * ineligible services stay blocked until their required documents are verified.
 */
import type {
  EligibilityDecision,
  EligibilityService,
  MissingDocumentCode,
} from "./eligibilityEngine.js";

export type OnboardingStatus =
  | "INCOMPLETE" // identity/vehicle prerequisites not met yet
  | "MANUAL_REVIEW_REQUIRED" // identity submitted but awaiting an agent decision
  | "BLOCKED" // no service eligible and policy forbids zero-eligibility onboarding
  | "READY_FOR_PAYMENT" // prerequisites met, fee not yet paid
  | "COMPLETE_LIMITED" // onboarded + paid, but not every service is eligible yet
  | "COMPLETE_FULL"; // onboarded + paid + every service eligible

export type OnboardingDecisionInput = {
  /** aadhaar + selfie verified (pan optional). */
  identityVerified: boolean;
  /** aadhaar + selfie submitted (possibly pending manual review). */
  identitySubmitted: boolean;
  /** identity docs uploaded but awaiting an agent decision. */
  identityInManualReview: boolean;
  /** a vehicle has been selected. */
  hasVehicle: boolean;
  /** onboarding fee paid. */
  paymentCompleted: boolean;
  /** per-service engine decisions at the rider's effective location. */
  services: Record<EligibilityService, EligibilityDecision>;
  /** ALLOW_ONBOARDING_WITH_ZERO_SERVICE_ELIGIBILITY (§8). */
  allowZeroServiceEligibility: boolean;
};

export type BlockedServiceInfo = {
  service: EligibilityService;
  missingDocuments: MissingDocumentCode[];
  reasons: string[];
};

export type OnboardingDecision = {
  status: OnboardingStatus;
  /** May the rider proceed to (or has completed) the onboarding payment step? */
  paymentEligible: boolean;
  eligibleServices: EligibilityService[];
  blockedServices: BlockedServiceInfo[];
  /** True when every service is eligible. */
  allEligible: boolean;
  /** Machine hint for the next onboarding action the app should drive. */
  nextAction:
    | "SELECT_VEHICLE"
    | "COMPLETE_IDENTITY"
    | "AWAIT_IDENTITY_VERIFICATION"
    | "AWAIT_IDENTITY_REVIEW"
    | "SUBMIT_REQUIRED_DOCUMENTS"
    | "COMPLETE_PAYMENT"
    | "SUBMIT_OPTIONAL_DOCUMENTS"
    | "NONE";
};

export function resolveOnboardingDecision(input: OnboardingDecisionInput): OnboardingDecision {
  const allServices = Object.keys(input.services) as EligibilityService[];
  const eligibleServices = allServices.filter((s) => input.services[s].eligible);
  const blockedServices: BlockedServiceInfo[] = allServices
    .filter((s) => !input.services[s].eligible)
    .map((s) => ({
      service: s,
      missingDocuments: input.services[s].missingDocuments,
      reasons: input.services[s].blocking.map((b) => b.reason),
    }));
  const allEligible = allServices.length > 0 && blockedServices.length === 0;

  const base = { paymentEligible: false, eligibleServices, blockedServices, allEligible };

  // Prerequisite 1: a vehicle must be selected (it drives every requirement).
  if (!input.hasVehicle) {
    return { ...base, status: "INCOMPLETE", nextAction: "SELECT_VEHICLE" };
  }

  // Prerequisite 2: identity (aadhaar + selfie) — always required, never a "service" gate.
  if (!input.identityVerified) {
    if (input.identityInManualReview) {
      return { ...base, status: "MANUAL_REVIEW_REQUIRED", nextAction: "AWAIT_IDENTITY_REVIEW" };
    }
    return {
      ...base,
      status: "INCOMPLETE",
      nextAction: input.identitySubmitted ? "AWAIT_IDENTITY_VERIFICATION" : "COMPLETE_IDENTITY",
    };
  }

  // Zero-eligibility gate (§8): with nothing eligible and policy forbidding it, block.
  if (eligibleServices.length === 0 && !input.allowZeroServiceEligibility) {
    return { ...base, status: "BLOCKED", nextAction: "SUBMIT_REQUIRED_DOCUMENTS" };
  }

  // Prerequisites met → payment may proceed (even with limited/zero eligibility if allowed).
  if (!input.paymentCompleted) {
    return { ...base, paymentEligible: true, status: "READY_FOR_PAYMENT", nextAction: "COMPLETE_PAYMENT" };
  }

  // Paid. Payment NEVER changes eligibility (§27) — status only reflects how many services are open.
  if (allEligible) {
    return { ...base, paymentEligible: true, status: "COMPLETE_FULL", nextAction: "NONE" };
  }
  return { ...base, paymentEligible: true, status: "COMPLETE_LIMITED", nextAction: "SUBMIT_OPTIONAL_DOCUMENTS" };
}
