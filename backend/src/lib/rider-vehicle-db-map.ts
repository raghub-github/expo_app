/**
 * Maps app-facing vehicle/fuel codes to production PostgreSQL enum labels.
 * DB fuel_type: EV, Petrol, Diesel, CNG
 * DB vehicle_type: bike, car, bicycle, scooter, auto, taxi, e_rickshaw, ev_car (+ migrations)
 */

const FUEL_APP_TO_DB: Record<string, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  cng: "CNG",
  electric: "EV",
  hybrid: "Petrol",
};

const FUEL_DB_TO_APP: Record<string, string> = {
  Petrol: "petrol",
  Diesel: "diesel",
  CNG: "cng",
  EV: "electric",
};

const VEHICLE_APP_TO_DB: Record<string, string> = {
  bike: "bike",
  ev_bike: "bike",
  cycle: "bicycle",
  car: "car",
  auto: "auto",
  cng_auto: "auto",
  ev_auto: "ev_car",
  taxi: "taxi",
  e_rickshaw: "e_rickshaw",
  ev_car: "ev_car",
  other: "other",
};

const VEHICLE_DB_TO_APP: Record<string, string> = {
  bicycle: "cycle",
  scooter: "bike",
  ev_car: "ev_auto",
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
  const key = appFuel.trim().toLowerCase();
  return FUEL_APP_TO_DB[key] ?? appFuel;
}

export function mapFuelTypeFromDb(dbFuel: string | null | undefined): string | null {
  if (!dbFuel) return null;
  return FUEL_DB_TO_APP[dbFuel] ?? dbFuel.trim().toLowerCase();
}

export function mapVehicleTypeToDb(appType: string): string {
  const key = appType.trim().toLowerCase();
  return VEHICLE_APP_TO_DB[key] ?? appType;
}

export function mapVehicleTypeFromDb(dbType: string): string {
  const key = dbType.trim().toLowerCase();
  return VEHICLE_DB_TO_APP[key] ?? key;
}
