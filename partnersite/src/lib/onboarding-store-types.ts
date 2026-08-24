export type OnboardingStoreTypeOption = {
  value: string;
  label: string;
};

const HIDDEN_STORE_TYPES = new Set(["RIDER"]);

const LABEL_OVERRIDES: Record<string, string> = {
  ELECTRONICS_ECOMMERCE: "Electronics and E-commerce",
  CLOUD_KITCHEN: "Cloud Kitchen",
  FOOD: "Food",
  GROCERY: "Grocery",
  RESTAURANT: "Restaurant",
  CAFE: "Cafe",
  BAKERY: "Bakery",
  PHARMA: "Pharma",
  STATIONERY: "Stationery",
  GARAGE: "Garage",
  FASHION: "Fashion",
  GENERAL: "General",
  WAREHOUSE: "Warehouse",
  STORE: "Store",
  OTHERS: "Others",
  OTHER: "Other",
};

export function formatStoreTypeLabel(code: string): string {
  const t = (code || "").trim().toUpperCase();
  if (!t) return "";
  if (LABEL_OVERRIDES[t]) return LABEL_OVERRIDES[t];
  return t
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeStoreTypeCode(code: string): string {
  return (code || "").trim().toUpperCase().replace(/\s+/g, "_");
}

export function isOtherStoreType(code: string): boolean {
  const t = normalizeStoreTypeCode(code);
  return t === "OTHER" || t === "OTHERS";
}

/** Default: cuisine picker on food-style types until super-admin overrides. */
const DEFAULT_CUISINE_LIST_STORE_TYPES = new Set([
  "FOOD",
  "RESTAURANT",
  "CAFE",
  "BAKERY",
  "CLOUD_KITCHEN",
  "FOOD_TRUCK",
  "ICE_CREAM_PARLOR",
  "GROCERY",
]);

export function defaultCuisineListEnabled(storeType: string): boolean {
  return DEFAULT_CUISINE_LIST_STORE_TYPES.has(normalizeStoreTypeCode(storeType));
}

export const FALLBACK_ONBOARDING_STORE_TYPES: OnboardingStoreTypeOption[] = [
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "CAFE", label: "Cafe" },
  { value: "BAKERY", label: "Bakery" },
  { value: "CLOUD_KITCHEN", label: "Cloud Kitchen" },
  { value: "FOOD", label: "Food" },
  { value: "GROCERY", label: "Grocery" },
  { value: "PHARMA", label: "Pharma" },
  { value: "STATIONERY", label: "Stationery" },
  { value: "ELECTRONICS_ECOMMERCE", label: "Electronics and E-commerce" },
  { value: "FASHION", label: "Fashion" },
  { value: "GARAGE", label: "Garage" },
  { value: "WAREHOUSE", label: "Warehouse" },
  { value: "STORE", label: "Store" },
  { value: "GENERAL", label: "General" },
];

export function buildOnboardingStoreTypeOptions(
  codes: string[],
  otherValue: "OTHER" | "OTHERS" = "OTHERS"
): OnboardingStoreTypeOption[] {
  const seen = new Set<string>();
  const out: OnboardingStoreTypeOption[] = [];
  for (const raw of codes) {
    const value = normalizeStoreTypeCode(raw);
    if (!value || seen.has(value) || HIDDEN_STORE_TYPES.has(value) || isOtherStoreType(value)) {
      continue;
    }
    seen.add(value);
    out.push({ value, label: formatStoreTypeLabel(value) });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  out.push({
    value: otherValue,
    label: otherValue === "OTHER" ? "Other" : "Others",
  });
  return out;
}
