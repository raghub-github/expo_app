import type { RiderServiceTypeValue } from "@/src/lib/rider-vehicle-form";
import type { OnboardingVehicleType } from "@/src/lib/onboarding-vehicle-types";

export type CategoryServiceAssignmentRow = {
  categoryCode: string;
  serviceType: RiderServiceTypeValue;
  isAssigned: boolean;
};

export type VehicleTypeServiceAssignmentRow = {
  vehicleTypeCode: string;
  serviceType: RiderServiceTypeValue;
  isAssigned: boolean;
  mapsToVehicleType: string | null;
  categoryCode: string | null;
  vehicleLabel: string;
};

export type CategoryServiceAssignmentsResponse = {
  rows: CategoryServiceAssignmentRow[];
  byCategory: Record<string, RiderServiceTypeValue[]>;
  vehicleRows?: VehicleTypeServiceAssignmentRow[];
  byMapsToVehicleType?: Record<string, RiderServiceTypeValue[]>;
};

/** Mirrors dashboard migration 0358 defaults — used when API is unavailable. */
export const FALLBACK_CATEGORY_SERVICE_BY_CODE: Record<string, RiderServiceTypeValue[]> = {
  "2_wheeler": ["food", "parcel", "person_ride"],
  "3_wheeler": ["parcel", "person_ride"],
  "4_wheeler_non_ac": ["person_ride"],
  "4_wheeler_ac": ["person_ride"],
  "4_wheeler": ["person_ride"],
};

export function normalizeOnboardingCategoryCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = raw.trim().toLowerCase();
  if (
    c === "2_wheeler" ||
    c === "3_wheeler" ||
    c === "4_wheeler_non_ac" ||
    c === "4_wheeler_ac"
  ) {
    return c;
  }
  if (c === "4_wheeler") return "4_wheeler_non_ac";
  if (c === "bike" || c === "bicycle" || c === "scooter") return "2_wheeler";
  if (c === "auto") return "3_wheeler";
  if (c === "cab" || c === "taxi" || c === "car" || c === "ev_car") return "4_wheeler_ac";
  return c;
}

export function resolveCategoryCodeForVehicleType(
  vehicleType: string | null | undefined,
  onboardingTypes: OnboardingVehicleType[],
  explicitCategory?: string | null
): string | null {
  const fromExplicit = normalizeOnboardingCategoryCode(explicitCategory);
  if (
    fromExplicit === "2_wheeler" ||
    fromExplicit === "3_wheeler" ||
    fromExplicit === "4_wheeler_non_ac" ||
    fromExplicit === "4_wheeler_ac" ||
    fromExplicit === "4_wheeler"
  ) {
    return fromExplicit;
  }
  const code = vehicleType?.trim().toLowerCase();
  if (!code) return null;
  const match = onboardingTypes.find(
    (t) => t.isActive && t.mapsToVehicleType?.trim().toLowerCase() === code
  );
  return normalizeOnboardingCategoryCode(match?.categoryCode ?? null);
}

export function getAssignedServicesForCategory(
  categoryCode: string | null | undefined,
  byCategory: Record<string, RiderServiceTypeValue[]>
): RiderServiceTypeValue[] {
  const normalized = normalizeOnboardingCategoryCode(categoryCode);
  if (!normalized) return [];
  return byCategory[normalized] ?? FALLBACK_CATEGORY_SERVICE_BY_CODE[normalized] ?? [];
}

export function filterServicesByCategoryAssignments(
  services: RiderServiceTypeValue[],
  categoryCode: string | null | undefined,
  byCategory: Record<string, RiderServiceTypeValue[]>
): RiderServiceTypeValue[] {
  const assigned = getAssignedServicesForCategory(categoryCode, byCategory);
  if (!assigned.length) return services;
  const allowed = new Set(assigned);
  return services.filter((s) => allowed.has(s));
}

export function getAssignedServicesForVehicleType(
  vehicleType: string | null | undefined,
  byMapsToVehicleType: Record<string, RiderServiceTypeValue[]> | undefined,
  categoryCode: string | null | undefined,
  byCategory: Record<string, RiderServiceTypeValue[]>
): RiderServiceTypeValue[] {
  const code = vehicleType?.trim().toLowerCase();
  if (code && byMapsToVehicleType && code in byMapsToVehicleType) {
    return byMapsToVehicleType[code] ?? [];
  }
  return getAssignedServicesForCategory(categoryCode, byCategory);
}

export function filterServicesByVehicleAssignments(
  services: RiderServiceTypeValue[],
  vehicleType: string | null | undefined,
  byMapsToVehicleType: Record<string, RiderServiceTypeValue[]> | undefined,
  categoryCode: string | null | undefined,
  byCategory: Record<string, RiderServiceTypeValue[]>
): RiderServiceTypeValue[] {
  const hasAssignmentData =
    Boolean(byMapsToVehicleType && Object.keys(byMapsToVehicleType).length > 0) ||
    Boolean(byCategory && Object.keys(byCategory).length > 0);
  const hasProfileContext = Boolean(vehicleType?.trim()) || Boolean(categoryCode?.trim());
  const assigned = getAssignedServicesForVehicleType(
    vehicleType,
    byMapsToVehicleType,
    categoryCode,
    byCategory
  );
  if (!assigned.length) {
    return hasAssignmentData && hasProfileContext ? [] : services;
  }
  const allowed = new Set(assigned);
  return services.filter((s) => allowed.has(s));
}
