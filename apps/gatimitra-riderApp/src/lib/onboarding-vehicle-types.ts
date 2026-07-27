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
  // Admin sometimes stores "Model A, Model B, Model C"
  if (label.includes(",")) {
    const parts = label
      .split(",")
      .map((part) => part.trim().replace(/\.\.+$/, "").trim())
      .filter(Boolean);
    if (parts.length > 1) return parts;
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

/** Persist only one model name — never a slash/comma-joined catalog string. */
export function normalizeSelectedVehicleModelLabel(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes(" / ")) {
    return trimmed.split(" / ")[0]!.trim() || undefined;
  }
  if (trimmed.includes(",")) {
    const first = trimmed.split(",")[0]!.trim().replace(/\.\.+$/, "").trim();
    return first || undefined;
  }
  return trimmed;
}

/** Preview title for multi-model catalog rows: "Maruti Swift, Maruti Alto.." */
export function formatVehicleGroupPreviewTitle(names: string[]): string {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return "Models";
  if (cleaned.length === 1) return cleaned[0]!;
  if (cleaned.length === 2) return `${cleaned[0]}, ${cleaned[1]}`;
  return `${cleaned[0]}, ${cleaned[1]}..`;
}

/** Flat model labels for every active vehicle in a category (expands "A / B" rows). */
export function categoryVehicleModelOptions(
  types: OnboardingVehicleType[],
  categoryCode?: string | null
): string[] {
  return vehiclesForCategory(types, categoryCode).flatMap(expandVehicleDisplayNames);
}

/**
 * Map a picked display name back to its catalog vehicle type.
 * For grouped labels, `modelLabel` is kept; for single-name types it is cleared.
 */
export function resolveVehicleSelectionFromModelLabel(
  types: OnboardingVehicleType[],
  categoryCode: string,
  modelLabel: string
): { type: OnboardingVehicleType; modelLabel: string | null } | null {
  const needle = modelLabel.trim();
  if (!needle) return null;
  for (const type of vehiclesForCategory(types, categoryCode)) {
    const names = expandVehicleDisplayNames(type);
    if (names.some((n) => n === needle)) {
      return {
        type,
        modelLabel: names.length > 1 ? needle : null,
      };
    }
  }
  return null;
}

export function buildCategoryHint(
  category: OnboardingVehicleCategory,
  types: OnboardingVehicleType[]
): string {
  const names = categoryVehicleModelOptions(types, category.code);
  if (!names.length) return category.hint?.trim() ?? "";
  return formatVehicleGroupPreviewTitle(names);
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
