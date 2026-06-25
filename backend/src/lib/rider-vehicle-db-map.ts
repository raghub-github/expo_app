/**
 * Maps app-facing vehicle/fuel codes to PostgreSQL enum labels.
 * DB enums use lowercase app codes (petrol, diesel, electric, …).
 */

const FUEL_APP_TO_DB: Record<string, string> = {
  petrol: "petrol",
  diesel: "diesel",
  cng: "cng",
  electric: "electric",
  hybrid: "hybrid",
  // Legacy dashboard / import labels
  Petrol: "petrol",
  Diesel: "diesel",
  CNG: "cng",
  EV: "electric",
};

const FUEL_DB_TO_APP: Record<string, string> = {
  petrol: "petrol",
  diesel: "diesel",
  cng: "cng",
  electric: "electric",
  hybrid: "hybrid",
  Petrol: "petrol",
  Diesel: "diesel",
  CNG: "cng",
  EV: "electric",
};

const VEHICLE_APP_TO_DB: Record<string, string> = {
  bike: "bike",
  ev_bike: "ev_bike",
  cycle: "cycle",
  car: "car",
  auto: "auto",
  cng_auto: "cng_auto",
  ev_auto: "ev_auto",
  taxi: "taxi",
  e_rickshaw: "e_rickshaw",
  ev_car: "ev_car",
  other: "other",
  // Legacy aliases
  scooter: "bike",
  bicycle: "cycle",
};

const VEHICLE_DB_TO_APP: Record<string, string> = {
  bicycle: "cycle",
  scooter: "bike",
};

/** Pricing / legacy codes → catalog vehicle_type codes used in ride dispatch. */
const CATALOG_VEHICLE_ALIASES: Record<string, string[]> = {
  two_wheeler: ["bike", "ev_bike", "cycle", "scooter", "bicycle"],
  cab: ["car", "taxi", "ev_car", "ev_auto"],
  auto: ["auto", "cng_auto", "ev_auto", "e_rickshaw"],
};

export function expandVehicleTypeCodesForCatalogMatch(raw: string): string[] {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key) return [];

  const codes = new Set<string>([key]);
  const appCode = mapVehicleTypeFromDb(key);
  if (appCode) codes.add(appCode.toLowerCase());

  const dbCode = mapVehicleTypeToDb(key);
  if (dbCode) codes.add(dbCode.toLowerCase());

  const aliases = CATALOG_VEHICLE_ALIASES[key];
  if (aliases) {
    for (const alias of aliases) codes.add(alias.toLowerCase());
  }

  return [...codes];
}

export function mapFuelTypeToDb(appFuel: string | null | undefined): string | null {
  if (!appFuel) return null;
  const key = appFuel.trim();
  const lower = key.toLowerCase();
  return FUEL_APP_TO_DB[key] ?? FUEL_APP_TO_DB[lower] ?? lower;
}

/** App fuel code → legacy PostgreSQL enum labels (dashboard 0061). */
const FUEL_APP_TO_LEGACY_ENUM: Record<string, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  cng: "CNG",
  electric: "EV",
  hybrid: "Petrol",
};

/** Onboarding category code → legacy vehicle_category enum label. */
function legacyVehicleCategoryFromOnboarding(
  onboardingCategoryCode: string | null | undefined,
  vehicleType: string,
): string | null {
  const cat = onboardingCategoryCode?.trim().toLowerCase() ?? "";
  const vt = vehicleType.trim().toLowerCase();

  if (cat === "2_wheeler") {
    return vt === "cycle" ? "Bicycle" : "Bike";
  }
  if (cat === "3_wheeler") {
    return "Auto";
  }
  if (cat === "4_wheeler_ac" || cat === "4_wheeler") {
    return vt === "taxi" ? "Taxi" : "Cab";
  }
  if (cat === "4_wheeler_non_ac") {
    return "Cab";
  }

  if (vt === "taxi") return "Taxi";
  if (vt === "car" || vt === "ev_car") return "Cab";
  if (["auto", "cng_auto", "ev_auto", "e_rickshaw"].includes(vt)) return "Auto";
  if (vt === "cycle") return "Bicycle";
  if (vt === "bike" || vt === "ev_bike") return "Bike";

  return null;
}

function pickEnumLabel(
  candidates: Array<string | null | undefined>,
  enumLabels: readonly string[],
): string | null {
  const ordered = candidates
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (enumLabels.length === 0) {
    const lowercase = ordered.find((value) => value === value.toLowerCase());
    return lowercase ?? ordered[0] ?? null;
  }

  for (const candidate of ordered) {
    if (enumLabels.includes(candidate)) {
      return candidate;
    }
    const caseInsensitive = enumLabels.find(
      (label) => label.toLowerCase() === candidate.toLowerCase(),
    );
    if (caseInsensitive) {
      return caseInsensitive;
    }
  }

  return null;
}

/**
 * Pick a fuel_type value accepted by the connected database.
 * Works with app enums (petrol, …) and legacy enums (Petrol, EV, …).
 */
export function resolveFuelTypeDbLabel(
  appFuel: string | null | undefined,
  enumLabels: readonly string[],
): string | null {
  const appCode = mapFuelTypeToDb(appFuel);
  if (!appCode) return null;

  const legacy = FUEL_APP_TO_LEGACY_ENUM[appCode];
  return pickEnumLabel([appCode, legacy], enumLabels) ?? appCode;
}

/**
 * Map onboarding vehicle category + vehicle type to rider_vehicles.vehicle_category.
 * Supports legacy enum labels (Cab, Auto, …) and onboarding codes (4_wheeler_ac, …).
 */
export function resolveVehicleCategoryDbLabel(
  onboardingCategoryCode: string | null | undefined,
  vehicleType: string,
  enumLabels: readonly string[],
): string | null {
  const onboardingCode = onboardingCategoryCode?.trim().toLowerCase() || null;
  const legacy = legacyVehicleCategoryFromOnboarding(onboardingCode, vehicleType);

  return pickEnumLabel([legacy, onboardingCode], enumLabels);
}

export function mapFuelTypeFromDb(dbFuel: string | null | undefined): string | null {
  if (!dbFuel) return null;
  const key = dbFuel.trim();
  return FUEL_DB_TO_APP[key] ?? key.toLowerCase();
}

export function mapVehicleTypeToDb(appType: string): string {
  const key = appType.trim().toLowerCase();
  return VEHICLE_APP_TO_DB[key] ?? key;
}

export function mapVehicleTypeFromDb(dbType: string): string {
  const key = dbType.trim().toLowerCase();
  return VEHICLE_DB_TO_APP[key] ?? key;
}
