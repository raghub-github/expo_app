import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveOnboardingDecision,
  type OnboardingDecisionInput,
} from "./onboardingEligibility.ts";
import { resolveDocumentLifecycleState } from "./documentLifecycle.ts";
import type { EligibilityDecision, EligibilityService, MissingDocumentCode } from "./eligibilityEngine.ts";

/* ── fixtures ──────────────────────────────────────────────────────────────────────── */

function decision(
  service: EligibilityService,
  eligible: boolean,
  missing: MissingDocumentCode[] = []
): EligibilityDecision {
  return {
    service,
    eligible,
    vehicleClass: "2_wheeler",
    fuelKind: "petrol",
    ownership: "non_commercial",
    dlState: "missing",
    rcState: "verified",
    commercialRequired: false,
    blocking: eligible
      ? []
      : missing.map((m) => ({
          code: m === "DRIVING_LICENSE" ? "DL_REQUIRED_NOT_VERIFIED" : "RC_REQUIRED_NOT_VERIFIED",
          reason: `${m} required`,
        })),
    missingDocuments: missing,
    resolvedGeo: null,
    ruleVersion: "default",
  } as EligibilityDecision;
}

function services(
  food: EligibilityDecision,
  parcel: EligibilityDecision,
  person: EligibilityDecision
): Record<EligibilityService, EligibilityDecision> {
  return { food, parcel, person_ride: person };
}

function baseInput(over: Partial<OnboardingDecisionInput> = {}): OnboardingDecisionInput {
  return {
    identityVerified: true,
    identitySubmitted: true,
    identityInManualReview: false,
    hasVehicle: true,
    paymentCompleted: false,
    allowZeroServiceEligibility: true,
    services: services(decision("food", true), decision("parcel", true), decision("person_ride", true)),
    ...over,
  };
}

/* ── the headline scenario: Petrol 2W, RC verified, DL not submitted ────────────────── */

test("Petrol 2W · RC verified · DL missing · food-only eligible → READY_FOR_PAYMENT then COMPLETE_LIMITED", () => {
  const svc = services(
    decision("food", true), // food: DL optional → eligible
    decision("parcel", false, ["DRIVING_LICENSE"]),
    decision("person_ride", false, ["DRIVING_LICENSE"])
  );
  const ready = resolveOnboardingDecision(baseInput({ services: svc, paymentCompleted: false }));
  assert.equal(ready.status, "READY_FOR_PAYMENT");
  assert.equal(ready.paymentEligible, true);
  assert.deepEqual(ready.eligibleServices, ["food"]);
  assert.equal(ready.blockedServices.length, 2);
  assert.deepEqual(ready.blockedServices[0]!.missingDocuments, ["DRIVING_LICENSE"]);

  const paid = resolveOnboardingDecision(baseInput({ services: svc, paymentCompleted: true }));
  assert.equal(paid.status, "COMPLETE_LIMITED");
  assert.equal(paid.allEligible, false);
});

test("all services eligible + paid → COMPLETE_FULL", () => {
  const d = resolveOnboardingDecision(baseInput({ paymentCompleted: true }));
  assert.equal(d.status, "COMPLETE_FULL");
  assert.equal(d.allEligible, true);
  assert.equal(d.nextAction, "NONE");
});

/* ── zero-eligibility policy (§8) ───────────────────────────────────────────────────── */

test("no service eligible + policy ALLOWS zero → READY_FOR_PAYMENT (limited after pay)", () => {
  const svc = services(
    decision("food", false, ["DRIVING_LICENSE"]),
    decision("parcel", false, ["DRIVING_LICENSE"]),
    decision("person_ride", false, ["DRIVING_LICENSE"])
  );
  const d = resolveOnboardingDecision(baseInput({ services: svc, allowZeroServiceEligibility: true }));
  assert.equal(d.status, "READY_FOR_PAYMENT");
  assert.equal(d.paymentEligible, true);
  assert.deepEqual(d.eligibleServices, []);
});

test("no service eligible + policy FORBIDS zero → BLOCKED, payment not allowed", () => {
  const svc = services(
    decision("food", false, ["DRIVING_LICENSE"]),
    decision("parcel", false, ["DRIVING_LICENSE"]),
    decision("person_ride", false, ["DRIVING_LICENSE"])
  );
  const d = resolveOnboardingDecision(baseInput({ services: svc, allowZeroServiceEligibility: false }));
  assert.equal(d.status, "BLOCKED");
  assert.equal(d.paymentEligible, false);
  assert.equal(d.nextAction, "SUBMIT_REQUIRED_DOCUMENTS");
});

/* ── prerequisites ──────────────────────────────────────────────────────────────────── */

test("no vehicle → INCOMPLETE / SELECT_VEHICLE", () => {
  const d = resolveOnboardingDecision(baseInput({ hasVehicle: false }));
  assert.equal(d.status, "INCOMPLETE");
  assert.equal(d.nextAction, "SELECT_VEHICLE");
  assert.equal(d.paymentEligible, false);
});

test("identity not submitted → INCOMPLETE / COMPLETE_IDENTITY", () => {
  const d = resolveOnboardingDecision(
    baseInput({ identityVerified: false, identitySubmitted: false })
  );
  assert.equal(d.status, "INCOMPLETE");
  assert.equal(d.nextAction, "COMPLETE_IDENTITY");
});

test("identity submitted but in manual review → MANUAL_REVIEW_REQUIRED", () => {
  const d = resolveOnboardingDecision(
    baseInput({ identityVerified: false, identitySubmitted: true, identityInManualReview: true })
  );
  assert.equal(d.status, "MANUAL_REVIEW_REQUIRED");
  assert.equal(d.paymentEligible, false);
});

test("payment NEVER unlocks a blocked service (§27): paid + food-only stays COMPLETE_LIMITED", () => {
  const svc = services(
    decision("food", true),
    decision("parcel", false, ["DRIVING_LICENSE"]),
    decision("person_ride", false, ["DRIVING_LICENSE"])
  );
  const d = resolveOnboardingDecision(baseInput({ services: svc, paymentCompleted: true }));
  assert.equal(d.status, "COMPLETE_LIMITED");
  assert.deepEqual(d.eligibleServices, ["food"]);
});

/* ── document lifecycle projection (§2) ─────────────────────────────────────────────── */

test("document lifecycle: required-missing vs optional-missing are distinct", () => {
  assert.equal(resolveDocumentLifecycleState(null, "required"), "REQUIRED_NOT_SUBMITTED");
  assert.equal(resolveDocumentLifecycleState(null, "optional"), "OPTIONAL_NOT_SUBMITTED");
  assert.equal(resolveDocumentLifecycleState(null, "exempt"), "NOT_STARTED");
});

test("document lifecycle: Cashfree auto-verify → AUTO_VERIFIED; agent approve → MANUALLY_VERIFIED", () => {
  assert.equal(
    resolveDocumentLifecycleState(
      { verified: false, verificationStatus: "auto_verified", verificationMethod: "CASHFREE_DL" },
      "required"
    ),
    "AUTO_VERIFIED"
  );
  assert.equal(
    resolveDocumentLifecycleState(
      { verified: true, verificationStatus: "approved", verificationMethod: "manual" },
      "required"
    ),
    "MANUALLY_VERIFIED"
  );
});

test("document lifecycle: rejected required → RESUBMISSION_REQUIRED; auto_rejected → AUTO_FAILED; manual review; pending; expiry", () => {
  assert.equal(
    resolveDocumentLifecycleState({ verified: false, verificationStatus: "rejected" }, "required"),
    "RESUBMISSION_REQUIRED"
  );
  assert.equal(
    resolveDocumentLifecycleState({ verified: false, verificationStatus: "rejected" }, "optional"),
    "REJECTED"
  );
  assert.equal(
    resolveDocumentLifecycleState({ verified: false, verificationStatus: "auto_rejected" }, "required"),
    "AUTO_FAILED"
  );
  assert.equal(
    resolveDocumentLifecycleState(
      { verified: false, verificationStatus: "pending", requiresManualReview: true },
      "required"
    ),
    "MANUAL_REVIEW_REQUIRED"
  );
  assert.equal(
    resolveDocumentLifecycleState({ verified: false, verificationStatus: "pending" }, "required"),
    "VERIFYING"
  );
  const past = new Date(Date.now() - 86_400_000);
  assert.equal(
    resolveDocumentLifecycleState(
      { verified: true, verificationStatus: "approved", expiresAt: past },
      "required"
    ),
    "EXPIRED"
  );
});
