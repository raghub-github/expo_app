/**
 * Onboarding requirements + eligibility SUMMARY (§7, §25, §26) — the single backend-
 * authoritative payload the rider app, agent dashboard, and onboarding payment gate all
 * render. It composes, for a real rider:
 *   • identity state (aadhaar + selfie)         — always-required KYC
 *   • the selected vehicle attributes           — drives requirements
 *   • per-service eligibility at the rider's location (the engine)
 *   • per-document lifecycle state (DL / RC)    — the 12-state view
 *   • the onboarding decision (status, payment eligibility, eligible/blocked services)
 * Nothing here is computed on the client; the app only displays this.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { riders, riderDocuments } from "../../db/schema.js";
import { getRiderKycDocumentsForApp } from "../../lib/rider-documents-kyc-catalog.js";
import { hasCompletedOnboardingPayment } from "../../lib/rider-onboarding-status.js";
import {
  loadRiderEligibilityAttributes,
  resolveRiderAllServiceEligibilityAtLocation,
  eligibilityEnforcementMode,
} from "./riderEligibility.service.js";
import {
  resolveDocumentLifecycleState,
  type DocumentLifecycleState,
  type DocRow,
} from "./documentLifecycle.js";
import { resolveOnboardingDecision, type OnboardingDecision } from "./onboardingEligibility.js";
import type { MissingDocumentCode } from "./eligibilityEngine.js";

/** ALLOW_ONBOARDING_WITH_ZERO_SERVICE_ELIGIBILITY (§8). Env-configurable; default TRUE
 * (do-not-block-unnecessarily). Admin/geo-level control can layer on later. */
export function allowOnboardingWithZeroEligibility(): boolean {
  const v = String(process.env.RIDER_ALLOW_ONBOARDING_ZERO_ELIGIBILITY ?? "true").trim().toLowerCase();
  return v !== "false" && v !== "0" && v !== "off";
}

export type OnboardingDocView = {
  code: MissingDocumentCode;
  /** required for at least one service that is currently blocked only by this doc-family. */
  requiredForSomeService: boolean;
  state: DocumentLifecycleState;
};

export type RiderOnboardingSummary = {
  riderId: number;
  vehicle: {
    vehicleClass: string | null;
    fuelKind: string | null;
    ownership: string;
    vehicleType: string | null;
  } | null;
  documents: OnboardingDocView[];
  services: Awaited<ReturnType<typeof resolveRiderAllServiceEligibilityAtLocation>>["services"];
  resolvedGeo: { level: string; refId: string } | null;
  onboarding: OnboardingDecision;
  /** True only when eligibility is actually enforced (enforce mode). */
  enforced: boolean;
};

function latestByType<T extends { docType: string }>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) if (!m.has(String(r.docType))) m.set(String(r.docType), r);
  return m;
}

export async function resolveRiderOnboardingSummary(riderId: number): Promise<RiderOnboardingSummary | null> {
  const db = getDb();
  const [rider] = await db
    .select({ id: riders.id, state: riders.state, pincode: riders.pincode, lat: riders.lat, lon: riders.lon })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);
  if (!rider) return null;

  // Vehicle attributes drive the engine (null vehicleClass = no verified vehicle on file).
  const attributes = await loadRiderEligibilityAttributes(riderId);
  const hasVehicle = attributes.vehicleClass != null;

  // Per-service eligibility at the rider's registered location.
  const { services, resolvedGeo } = await resolveRiderAllServiceEligibilityAtLocation({
    riderId,
    lat: rider.lat ?? null,
    lng: rider.lon ?? null,
    pincode: rider.pincode ?? null,
    state: rider.state ?? null,
  });

  // Identity (aadhaar + selfie). getRiderKycDocumentsForApp returns only uploaded docs.
  const kyc = await getRiderKycDocumentsForApp(riderId);
  const aadhaar = kyc.documents.find((d) => d.docKey === "aadhaar");
  const selfie = kyc.documents.find((d) => d.docKey === "selfie");
  const identitySubmitted = Boolean(aadhaar?.uploaded && selfie?.uploaded);
  const identityVerified = aadhaar?.status === "verified" && selfie?.status === "verified";
  const identityInManualReview =
    identitySubmitted && !identityVerified &&
    aadhaar?.status !== "rejected" && selfie?.status !== "rejected";

  const paymentCompleted = await hasCompletedOnboardingPayment(riderId);

  const onboarding = resolveOnboardingDecision({
    identityVerified: Boolean(identityVerified),
    identitySubmitted,
    identityInManualReview: Boolean(identityInManualReview),
    hasVehicle,
    paymentCompleted,
    services,
    allowZeroServiceEligibility: allowOnboardingWithZeroEligibility(),
  });

  // Per-document lifecycle for DL + RC (the service-gating docs).
  const docRows = await db
    .select({
      docType: riderDocuments.docType,
      verified: riderDocuments.verified,
      verificationStatus: riderDocuments.verificationStatus,
      requiresManualReview: riderDocuments.requiresManualReview,
      expiryDate: riderDocuments.expiryDate,
    })
    .from(riderDocuments)
    .where(eq(riderDocuments.riderId, riderId));
  const byType = latestByType(docRows);

  const anyBlockedNeeds = (code: MissingDocumentCode): boolean =>
    onboarding.blockedServices.some((b) => b.missingDocuments.includes(code));

  const docView = (code: MissingDocumentCode, dbType: string): OnboardingDocView => {
    const row = byType.get(dbType);
    const requiredForSomeService = anyBlockedNeeds(code);
    const requirement = requiredForSomeService ? "required" : "optional";
    const r: DocRow = row
      ? {
          verified: row.verified,
          verificationStatus: row.verificationStatus,
          requiresManualReview: row.requiresManualReview,
          submitted: true,
          expiresAt: row.expiryDate ?? null,
        }
      : null;
    return { code, requiredForSomeService, state: resolveDocumentLifecycleState(r, requirement) };
  };

  return {
    riderId,
    vehicle: hasVehicle
      ? {
          vehicleClass: attributes.vehicleClass,
          fuelKind: attributes.fuelKind ?? null,
          ownership: attributes.ownership,
          vehicleType: attributes.vehicleType ?? null,
        }
      : null,
    documents: [docView("DRIVING_LICENSE", "dl"), docView("REGISTRATION_CERTIFICATE", "rc")],
    services,
    resolvedGeo,
    onboarding,
    enforced: eligibilityEnforcementMode() === "enforce",
  };
}
