/**
 * Load which vehicle categories / types are enabled for PARCEL dispatch
 * from Super Admin assignments (same source as dashboard "Rider vehicle types").
 */

import { api } from "@/services/api";
import {
  buildParcelSlide,
  FALLBACK_PARCEL_CATEGORY_CODES,
  isParcelCategoryCode,
  PARCEL_CATEGORY_ORDER,
  type ParcelVehicleCategoryCode,
  type ParcelVehicleSlide,
} from "./parcelGuidelinesConfig";

type AssignmentRow = {
  categoryCode: string;
  serviceType: "food" | "parcel" | "person_ride";
  isAssigned: boolean;
};

type VehicleAssignmentRow = {
  vehicleTypeCode: string;
  serviceType: "food" | "parcel" | "person_ride";
  isAssigned: boolean;
  mapsToVehicleType: string | null;
  categoryCode: string | null;
  vehicleLabel: string;
};

type AssignmentsResponse = {
  rows?: AssignmentRow[];
  vehicleRows?: VehicleAssignmentRow[];
  byCategory?: Record<string, Array<"food" | "parcel" | "person_ride">>;
};

function uniqueLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function slidesFromAssignments(data: AssignmentsResponse | null | undefined): ParcelVehicleSlide[] {
  const enabled = new Set<ParcelVehicleCategoryCode>();

  for (const row of data?.rows ?? []) {
    if (row.serviceType !== "parcel" || !row.isAssigned) continue;
    if (isParcelCategoryCode(row.categoryCode)) enabled.add(row.categoryCode);
  }

  if (enabled.size === 0 && data?.byCategory) {
    for (const [code, services] of Object.entries(data.byCategory)) {
      if (services.includes("parcel") && isParcelCategoryCode(code)) enabled.add(code);
    }
  }

  if (enabled.size === 0) {
    for (const code of FALLBACK_PARCEL_CATEGORY_CODES) enabled.add(code);
  }

  const labelsByCategory = new Map<ParcelVehicleCategoryCode, string[]>();
  for (const row of data?.vehicleRows ?? []) {
    if (row.serviceType !== "parcel" || !row.isAssigned) continue;
    const cat = row.categoryCode && isParcelCategoryCode(row.categoryCode) ? row.categoryCode : null;
    if (!cat || !enabled.has(cat)) continue;
    const list = labelsByCategory.get(cat) ?? [];
    list.push(row.vehicleLabel || row.vehicleTypeCode);
    labelsByCategory.set(cat, list);
  }

  return PARCEL_CATEGORY_ORDER.filter((c) => enabled.has(c)).map((code) =>
    buildParcelSlide(code, uniqueLabels(labelsByCategory.get(code) ?? []))
  );
}

export async function fetchParcelGuidelineSlides(): Promise<ParcelVehicleSlide[]> {
  try {
    const { data } = await api.get<AssignmentsResponse>(
      "/v1/onboarding/category-service-assignments",
      { timeout: 8_000 }
    );
    return slidesFromAssignments(data);
  } catch {
    return FALLBACK_PARCEL_CATEGORY_CODES.map((code) => buildParcelSlide(code));
  }
}

/** Assigned parcel vehicle categories for the book screen (geo slab quote keys). */
export async function fetchParcelBookVehicleCodes(): Promise<ParcelVehicleCategoryCode[]> {
  const slides = await fetchParcelGuidelineSlides();
  const codes = slides.map((s) => s.categoryCode);
  return codes.length > 0 ? codes : [...FALLBACK_PARCEL_CATEGORY_CODES];
}
