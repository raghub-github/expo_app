/**
 * Onboarding Step 3: compare rider's selected vehicle catalog row vs Cashfree RC payload.
 * Additive to Aadhaar name mismatch — never auto-approves RC photos.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderDocuments, riderOnboardingVehicleTypes } from "../db/schema.js";
import {
  canonicalClassFromCashfreeRc,
  vehicleClassDisplayLabel,
} from "../modules/rider-eligibility/vehicleTaxonomy.js";
import { vehicleClassFromCategory } from "../modules/rider-eligibility/riderEligibilityInputs.js";
import type { VehicleClass } from "../modules/rider-eligibility/eligibilityEngine.js";

export type RcFuelKind = "electric" | "petrol" | "diesel" | "cng" | "hybrid" | "unknown";

function str(v: unknown): string {
  return String(v ?? "").trim();
}

export function inferRcFuelKind(verifiedData: Record<string, unknown>): RcFuelKind {
  const raw = [verifiedData.fuel_type, verifiedData.type, verifiedData.fuel]
    .map(str)
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  if (!raw) return "unknown";
  if (/ELECTRIC|EV\b|BATTERY/.test(raw)) return "electric";
  if (/DIESEL|HSD/.test(raw)) return "diesel";
  if (/\bCNG\b|LPG|COMPRESSED\s*NATURAL/.test(raw)) return "cng";
  if (/PETROL|MOTOR\s*SPIRIT|\bMS\b/.test(raw)) return "petrol";
  if (/HYBRID/.test(raw)) return "hybrid";
  return "unknown";
}

/** Mirrors rider-app `isElectricOnboardingVehicle` for catalog codes. */
export function isElectricOnboardingCatalogChoice(input: {
  vehicleChoice?: string | null;
  vehicleCategoryCode?: string | null;
  onboardingFlow?: string | null;
  label?: string | null;
}): boolean {
  if (input.onboardingFlow === "rental_ev") return true;
  const hay = [
    input.vehicleChoice,
    input.vehicleCategoryCode,
    input.label,
  ]
    .map(str)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\bev[_-]?|electric|e[_-]?rickshaw/.test(hay);
}

export function rcVehicleDisplayLabel(verifiedData: Record<string, unknown>): string {
  const cls =
    str(verifiedData.vehicle_class) ||
    str(verifiedData.class) ||
    str(verifiedData.body_type) ||
    "";
  const fuel = inferRcFuelKind(verifiedData);
  const fuelLabel =
    fuel === "electric"
      ? "Electric"
      : fuel === "petrol"
        ? "Petrol"
        : fuel === "diesel"
          ? "Diesel"
          : fuel === "cng"
            ? "CNG"
            : "";
  const canon = canonicalClassFromCashfreeRc(verifiedData);
  const wheel = canon ? vehicleClassDisplayLabel(canon) : "";
  const parts = [wheel, cls, fuelLabel].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Vehicle on RC";
}

export type RcOnboardingVehicleMatch = {
  match: boolean;
  rcClass: VehicleClass | null;
  selectedClass: VehicleClass | null;
  rcFuel: RcFuelKind;
  selectedElectric: boolean;
  rcLabel: string;
  selectedLabel: string;
  /** False when RC class/fuel could not be parsed — do not show type-mismatch UI. */
  rcSignalKnown: boolean;
};

export function evaluateRcOnboardingVehicleMatch(args: {
  vehicleChoice: string | null | undefined;
  vehicleCategoryCode: string | null | undefined;
  onboardingFlow?: string | null;
  vehicleTypeLabel?: string | null;
  verifiedData: Record<string, unknown>;
}): RcOnboardingVehicleMatch {
  const selectedClass = vehicleClassFromCategory(
    args.vehicleCategoryCode ?? null,
    args.vehicleChoice ?? null,
  );
  const rcClass = canonicalClassFromCashfreeRc(args.verifiedData);
  const rcFuel = inferRcFuelKind(args.verifiedData);
  const selectedElectric = isElectricOnboardingCatalogChoice({
    vehicleChoice: args.vehicleChoice,
    vehicleCategoryCode: args.vehicleCategoryCode,
    onboardingFlow: args.onboardingFlow,
    label: args.vehicleTypeLabel,
  });
  const rcLabel = rcVehicleDisplayLabel(args.verifiedData);
  const selectedLabel =
    args.vehicleTypeLabel?.trim() ||
    args.vehicleChoice?.trim() ||
    args.vehicleCategoryCode?.trim() ||
    "Selected vehicle";

  const rcSignalKnown = rcClass != null || rcFuel !== "unknown";

  if (!rcSignalKnown) {
    return {
      match: true,
      rcClass,
      selectedClass,
      rcFuel,
      selectedElectric,
      rcLabel,
      selectedLabel,
      rcSignalKnown: false,
    };
  }

  let match = true;
  if (selectedClass && rcClass && selectedClass !== rcClass) {
    match = false;
  }
  if (selectedElectric && (rcFuel === "petrol" || rcFuel === "diesel" || rcFuel === "cng")) {
    match = false;
  }
  if (!selectedElectric && rcFuel === "electric") {
    match = false;
  }

  return {
    match,
    rcClass,
    selectedClass,
    rcFuel,
    selectedElectric,
    rcLabel,
    selectedLabel,
    rcSignalKnown: true,
  };
}

export type SuggestedOnboardingVehicle = {
  vehicleChoice: string;
  vehicleCategoryCode: string;
  label: string;
  onboardingFlow: "dl_rc" | "rental_ev" | "payment";
};

/** Pick the best active catalog row for a verified RC (used on Proceed & Switch). */
export async function suggestOnboardingVehicleTypeFromRc(
  verifiedData: Record<string, unknown>,
): Promise<SuggestedOnboardingVehicle | null> {
  const rcClass = canonicalClassFromCashfreeRc(verifiedData);
  const rcFuel = inferRcFuelKind(verifiedData);
  if (!rcClass) return null;

  const db = getDb();
  const rows = await db
    .select({
      code: riderOnboardingVehicleTypes.code,
      categoryCode: riderOnboardingVehicleTypes.categoryCode,
      label: riderOnboardingVehicleTypes.label,
      onboardingFlow: riderOnboardingVehicleTypes.onboardingFlow,
      mapsToVehicleType: riderOnboardingVehicleTypes.mapsToVehicleType,
    })
    .from(riderOnboardingVehicleTypes)
    .where(eq(riderOnboardingVehicleTypes.isActive, true));

  const wantElectric = rcFuel === "electric";
  const candidates = rows.filter((row) => {
    const cat = str(row.categoryCode);
    const rowClass = vehicleClassFromCategory(cat, row.code);
    if (rowClass !== rcClass) return false;
    const electric = isElectricOnboardingCatalogChoice({
      vehicleChoice: row.code,
      vehicleCategoryCode: cat,
      onboardingFlow: row.onboardingFlow,
      label: row.label,
    });
    if (wantElectric && !electric) return false;
    if (!wantElectric && electric && rcFuel !== "unknown") return false;
    return true;
  });

  const pool = candidates.length ? candidates : rows.filter((row) => {
    const cat = str(row.categoryCode);
    return vehicleClassFromCategory(cat, row.code) === rcClass;
  });
  if (!pool.length) return null;

  const score = (row: (typeof rows)[0]): number => {
    let s = 0;
    const code = row.code.toLowerCase();
    const label = str(row.label).toLowerCase();
    const rawClass = str(verifiedData.vehicle_class).toLowerCase();
    if (wantElectric && (code.includes("ev") || label.includes("ev"))) s += 10;
    if (!wantElectric && !code.includes("ev") && row.onboardingFlow !== "rental_ev") s += 5;
    if (rawClass.includes("scooter") && (code.includes("scooter") || label.includes("scooter")))
      s += 8;
    if (rawClass.includes("cycle") && code.includes("bike")) s += 4;
    if (row.onboardingFlow === "rental_ev" && wantElectric) s += 6;
    return s;
  };

  pool.sort((a, b) => score(b) - score(a));
  const best = pool[0]!;
  const flow =
    best.onboardingFlow === "rental_ev" ||
    best.onboardingFlow === "payment" ||
    best.onboardingFlow === "dl_rc"
      ? best.onboardingFlow
      : "dl_rc";
  const categoryCode = str(best.categoryCode);
  if (!categoryCode) return null;
  return {
    vehicleChoice: best.code,
    vehicleCategoryCode: categoryCode,
    label: str(best.label) || best.code,
    onboardingFlow: flow,
  };
}

export async function clearRiderRcElectronicVerification(riderId: number): Promise<void> {
  const db = getDb();
  const [existingRc] = await db
    .select()
    .from(riderDocuments)
    .where(and(eq(riderDocuments.riderId, riderId), eq(riderDocuments.docType, "rc")))
    .limit(1);
  if (!existingRc) return;
  const prevMeta =
    existingRc.metadata && typeof existingRc.metadata === "object"
      ? ({ ...(existingRc.metadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  for (const key of rcMetadataKeysToClearOnResubmitOrPlateChange()) {
    delete prevMeta[key];
  }
  prevMeta.rcVerificationState = "NOT_SUBMITTED";
  await db
    .update(riderDocuments)
    .set({
      fileUrl: "pending",
      verified: false,
      verificationMethod: "MANUAL_UPLOAD",
      verificationStatus: null,
      requiresManualReview: false,
      metadata: prevMeta,
    })
    .where(eq(riderDocuments.id, existingRc.id));
}

export function rcMetadataKeysToClearOnResubmitOrPlateChange(): string[] {
  return [
    "cashfreeVerifiedData",
    "verifiedDetails",
    "rcOwnerName",
    "cashfreeProvider",
    "rcVehicleTypeMismatchPending",
    "rcVehicleTypeMismatch",
    "rcVehicleMismatchResolvedAt",
    "rcVehicleMismatchResolution",
    "electronicVerifiedAt",
  ];
}

/**
 * Pull a reusable Cashfree RC payload from an existing rider_documents.rc row.
 * Used to re-check vehicle-type match after the rider changes Category/Type
 * without consuming a new Cashfree verification attempt.
 */
export function extractReusableRcVerifiedData(args: {
  docNumber?: string | null;
  metadata?: Record<string, unknown> | null;
  requestedVehicleNumber: string;
}): { plate: string; verifiedData: Record<string, unknown> } | null {
  const requested = str(args.requestedVehicleNumber)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!requested) return null;
  const meta = args.metadata && typeof args.metadata === "object" ? args.metadata : {};
  const storedPlate = str(args.docNumber || meta.rcNumber || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!storedPlate || storedPlate !== requested) return null;
  const raw =
    (meta.cashfreeVerifiedData && typeof meta.cashfreeVerifiedData === "object"
      ? meta.cashfreeVerifiedData
      : null) ||
    (meta.verifiedDetails && typeof meta.verifiedDetails === "object"
      ? meta.verifiedDetails
      : null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return { plate: storedPlate, verifiedData: { ...(raw as Record<string, unknown>) } };
}

export const RC_INCOMPATIBLE_REUSE_MESSAGE =
  "This RC is not registered for the selected vehicle type. Continue with the vehicle type verified by this RC or submit a different RC.";
