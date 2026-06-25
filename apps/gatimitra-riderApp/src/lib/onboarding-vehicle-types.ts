export type OnboardingVehicleFlow = "dl_rc" | "rental_ev" | "payment";

export type OnboardingVehicleDocRequirements = {
  required_docs?: string[];
  optional_docs?: string[];
  has_own_vehicle?: boolean;
  requires_max_speed?: boolean;
};

export type OnboardingVehicleCategory = {
  id: number;
  code: string;
  label: string;
  hint: string | null;
  icon: string | null;
  wheelCount: number;
  sortOrder: number;
  isActive: boolean;
};

export type OnboardingVehicleType = {
  id: number;
  code: string;
  categoryCode: string | null;
  label: string;
  hint: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  onboardingFlow: OnboardingVehicleFlow;
  documentRequirements: OnboardingVehicleDocRequirements;
  infoMessage: string | null;
  mapsToVehicleType: string | null;
};

/** @deprecated Empty — catalog is loaded from `/v1/onboarding/vehicle-categories`. */
export const FALLBACK_ONBOARDING_VEHICLE_CATEGORIES: OnboardingVehicleCategory[] = [];

/** @deprecated Empty — catalog is loaded from `/v1/onboarding/vehicle-types`. */
export const FALLBACK_ONBOARDING_VEHICLE_TYPES: OnboardingVehicleType[] = [];

export function findVehicleType(
  types: OnboardingVehicleType[],
  code?: string | null
): OnboardingVehicleType | undefined {
  if (!code) return undefined;
  return types.find((t) => t.code === code);
}

export function findVehicleCategory(
  categories: OnboardingVehicleCategory[],
  code?: string | null
): OnboardingVehicleCategory | undefined {
  if (!code) return undefined;
  return categories.find((c) => c.code === code);
}

export function vehiclesForCategory(
  types: OnboardingVehicleType[],
  categoryCode?: string | null
): OnboardingVehicleType[] {
  if (!categoryCode) return [];
  return types
    .filter((t) => t.categoryCode === categoryCode && t.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export function categoryHasActiveVehicles(
  types: OnboardingVehicleType[],
  categoryCode: string
): boolean {
  return types.some((t) => t.categoryCode === categoryCode && t.isActive);
}

export function isVehicleFlowPayment(type?: OnboardingVehicleType): boolean {
  return type?.onboardingFlow === "payment";
}

/** Flat list of display names for one catalog row (splits grouped admin labels). */
export function expandVehicleDisplayNames(
  type: Pick<OnboardingVehicleType, "label" | "mapsToVehicleType">
): string[] {
  const label = type.label?.trim() ?? "";
  if (label.includes(" / ")) {
    return label
      .split(" / ")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  const single = formatVehicleRowTitle(type);
  if (single.includes("\n")) {
    return single
      .split("\n")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return single ? [single] : [];
}

const CATEGORY_HINT_PREVIEW_COUNT = 3;

/** Short preview for category picker — inner vehicle step shows the full list. */
export function buildCategoryHint(
  category: OnboardingVehicleCategory,
  types: OnboardingVehicleType[]
): string {
  const names = vehiclesForCategory(types, category.code).flatMap(expandVehicleDisplayNames);
  if (!names.length) return category.hint?.trim() ?? "";
  if (names.length <= CATEGORY_HINT_PREVIEW_COUNT) {
    return names.join(", ");
  }
  return `${names.slice(0, CATEGORY_HINT_PREVIEW_COUNT).join(", ")} & more`;
}

/** Show full vehicle label — multi-model admin labels render on separate lines, never truncated. */
export function formatVehicleRowTitle(type: Pick<OnboardingVehicleType, "label" | "mapsToVehicleType">): string {
  const label = type.label?.trim() ?? "";
  if (label.includes(" / ")) {
    return label
      .split(" / ")
      .map((part) => part.trim())
      .filter(Boolean)
      .join("\n");
  }
  if (label) return label;
  const mapsTo = type.mapsToVehicleType?.trim();
  if (!mapsTo) return "Vehicle";
  return mapsTo
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
