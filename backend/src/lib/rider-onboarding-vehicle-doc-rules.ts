import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderOnboardingVehicleTypes } from "../db/schema.js";
import {
  isOnboardingDocSkipped,
  isOnboardingDocUsable,
  normalizeOnboardingDocCode,
  type OnboardingDocRow,
  vehicleStepCompleteByRequired,
} from "./rider-onboarding-progress-docs.js";
import { isRcCompleteForOnboardingProgress } from "./rider-rc-verification-state.js";

export type VehicleDocRequirements = {
  required_docs: string[];
  optional_docs: string[];
};

export async function loadVehicleDocRequirements(
  vehicleChoice: string | null | undefined,
): Promise<VehicleDocRequirements | null> {
  const choice = String(vehicleChoice || "").trim();
  if (!choice) return null;
  const db = getDb();
  const [row] = await db
    .select({ documentRequirements: riderOnboardingVehicleTypes.documentRequirements })
    .from(riderOnboardingVehicleTypes)
    .where(eq(riderOnboardingVehicleTypes.code, choice))
    .limit(1);
  if (!row?.documentRequirements || typeof row.documentRequirements !== "object") {
    return null;
  }
  const req = row.documentRequirements as {
    required_docs?: unknown;
    optional_docs?: unknown;
  };
  const required = Array.isArray(req.required_docs)
    ? req.required_docs.map((c) => String(c || "").trim()).filter(Boolean)
    : [];
  const optional = Array.isArray(req.optional_docs)
    ? req.optional_docs
        .map((c) => String(c || "").trim())
        .filter(Boolean)
        .filter((c) => !required.includes(c))
    : [];
  return { required_docs: required, optional_docs: optional };
}

/** Skips are allowed for catalog optional_docs; soft onboarding skips may also keep vehicle docs. */
export function filterSkippableOnboardingDocs(
  requirements: VehicleDocRequirements | null,
  skipped?: string[] | null,
  opts?: { allowOnboardingSoftSkips?: boolean },
): string[] {
  if (!skipped?.length) return [];
  const bankSkips = skipped
    .map((c) => String(c || "").trim())
    .filter((c) => /^(bank_account|bank_proof)$/i.test(c));
  if (!requirements) return bankSkips;
  const optional = new Set(
    requirements.optional_docs.map((c) => normalizeOnboardingDocCode(c)),
  );
  const onVehicle = new Set(
    [...requirements.required_docs, ...requirements.optional_docs].map((c) =>
      normalizeOnboardingDocCode(c),
    ),
  );
  const vehicleSkips = skipped
    .map((c) => String(c || "").trim())
    .filter(Boolean)
    .filter((code) => {
      if (/^(bank_account|bank_proof)$/i.test(code)) return false;
      const norm = normalizeOnboardingDocCode(code);
      if (optional.has(norm)) return true;
      if (opts?.allowOnboardingSoftSkips && onVehicle.has(norm)) return true;
      return false;
    });
  return Array.from(new Set([...vehicleSkips, ...bankSkips]));
}

export function isDocCodeRequired(
  requirements: VehicleDocRequirements | null,
  code: string,
): boolean {
  if (!requirements) return true;
  const norm = normalizeOnboardingDocCode(code);
  return requirements.required_docs.some(
    (c) => normalizeOnboardingDocCode(c) === norm,
  );
}

function docRowUsable(docs: OnboardingDocRow[], code: string): boolean {
  const norm = normalizeOnboardingDocCode(code);
  if (norm === "dl") {
    return (
      isOnboardingDocUsable(docs.find((d) => d.docType === "dl")) ||
      (isOnboardingDocUsable(docs.find((d) => d.docType === "dl_front")) &&
        isOnboardingDocUsable(docs.find((d) => d.docType === "dl_back")))
    );
  }
  if (norm === "rc") {
    const rc = docs.find((d) => d.docType === "rc");
    return isRcCompleteForOnboardingProgress(rc, false, isOnboardingDocUsable);
  }
  const row = docs.find(
    (d) => d.docType === code || normalizeOnboardingDocCode(d.docType) === norm,
  );
  return isOnboardingDocUsable(row);
}

/**
 * All required_docs must be uploaded/verified; skipped codes (optional or soft) count as done.
 */
export function validateRequiredVehicleDocs(
  requirements: VehicleDocRequirements | null,
  docs: OnboardingDocRow[],
  skippedRaw?: string[] | null,
): { ok: true } | { ok: false; missing: string[]; invalidSkips: string[] } {
  if (!requirements?.required_docs.length) {
    return { ok: true };
  }
  const skipped = filterSkippableOnboardingDocs(requirements, skippedRaw ?? [], {
    allowOnboardingSoftSkips: true,
  });
  const skippedNorm = new Set(skipped.map((c) => normalizeOnboardingDocCode(c)));
  const invalidSkips = (skippedRaw ?? []).filter(
    (c) => !skipped.some((s) => normalizeOnboardingDocCode(s) === normalizeOnboardingDocCode(c)),
  );
  const missing = requirements.required_docs.filter((code) => {
    if (skippedNorm.has(normalizeOnboardingDocCode(code))) return false;
    return !docRowUsable(docs, code);
  });
  if (invalidSkips.length || missing.length) {
    return { ok: false, missing, invalidSkips };
  }
  return { ok: true };
}

export function vehicleRequiredDocsSatisfied(
  requirements: VehicleDocRequirements | null,
  docs: OnboardingDocRow[],
  skippedRaw?: string[] | null,
): boolean {
  if (!requirements?.required_docs.length) return true;
  const skipped = filterSkippableOnboardingDocs(requirements, skippedRaw ?? [], {
    allowOnboardingSoftSkips: true,
  });
  return vehicleStepCompleteByRequired(docs, requirements.required_docs, skipped);
}
