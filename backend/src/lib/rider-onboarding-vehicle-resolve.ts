import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { riderOnboardingVehicleTypes } from "../db/schema.js";

const VALID_APP_VEHICLE_TYPES = new Set([
  "bike",
  "ev_bike",
  "cycle",
  "car",
  "auto",
  "cng_auto",
  "ev_auto",
  "taxi",
  "e_rickshaw",
  "ev_car",
  "other",
]);

/** Onboarding catalog `maps_to_vehicle_type` → rider_vehicles.vehicle_type enum. */
const CATALOG_TO_APP_VEHICLE_TYPE: Record<string, string> = {
  scooter: "bike",
  bicycle: "cycle",
  e_cycle: "cycle",
  auto_rickshaw: "auto",
  ev_car_ac: "ev_car",
  cab_ac: "taxi",
  sedan_ac: "car",
};

const CATALOG_OTHER_VEHICLE_TYPES = new Set([
  "cargo_auto",
  "loader_auto",
  "tata_ace",
  "pickup",
  "cargo_van",
  "mini_truck",
]);

export function resolveAppVehicleTypeFromCatalogRow(input: {
  code: string;
  mapsToVehicleType: string | null;
  label: string | null;
}): { vehicleType: string; customTypeLabel: string | null } {
  const raw = (input.mapsToVehicleType?.trim() || input.code.trim()).toLowerCase();
  if (VALID_APP_VEHICLE_TYPES.has(raw)) {
    return { vehicleType: raw, customTypeLabel: null };
  }
  const alias = CATALOG_TO_APP_VEHICLE_TYPE[raw];
  if (alias) {
    return { vehicleType: alias, customTypeLabel: null };
  }
  if (CATALOG_OTHER_VEHICLE_TYPES.has(raw)) {
    return {
      vehicleType: "other",
      customTypeLabel: input.label?.trim() || raw,
    };
  }
  return {
    vehicleType: "other",
    customTypeLabel: input.label?.trim() || raw,
  };
}

export async function resolveVehicleTypeFromOnboardingChoice(
  vehicleChoice: string | null | undefined,
  fallbackFormType: string
): Promise<{ vehicleType: string; customTypeLabel: string | null; vehicleChoice: string | null }> {
  const choice = vehicleChoice?.trim();
  const fallback = fallbackFormType.trim().toLowerCase() || "bike";
  if (!choice) {
    return { vehicleType: fallback, customTypeLabel: null, vehicleChoice: null };
  }

  const db = getDb();
  const [row] = await db
    .select({
      code: riderOnboardingVehicleTypes.code,
      mapsToVehicleType: riderOnboardingVehicleTypes.mapsToVehicleType,
      label: riderOnboardingVehicleTypes.label,
      categoryCode: riderOnboardingVehicleTypes.categoryCode,
    })
    .from(riderOnboardingVehicleTypes)
    .where(
      and(
        eq(riderOnboardingVehicleTypes.code, choice),
        eq(riderOnboardingVehicleTypes.isActive, true)
      )
    )
    .limit(1);

  if (!row) {
    return { vehicleType: fallback, customTypeLabel: null, vehicleChoice: choice };
  }

  const resolved = resolveAppVehicleTypeFromCatalogRow({
    code: row.code,
    mapsToVehicleType: row.mapsToVehicleType,
    label: row.label,
  });

  return {
    vehicleType: resolved.vehicleType,
    customTypeLabel: resolved.customTypeLabel,
    vehicleChoice: choice,
  };
}

export function suggestAcTypeForCategory(categoryCode: string | null | undefined): "AC" | "Non-AC" | null {
  const code = categoryCode?.trim().toLowerCase();
  if (code === "4_wheeler_ac") return "AC";
  if (code === "4_wheeler_non_ac" || code === "4_wheeler") return "Non-AC";
  return null;
}

export function suggestIsCommercialForCategory(categoryCode: string | null | undefined): boolean | null {
  const code = categoryCode?.trim().toLowerCase();
  if (code === "4_wheeler_ac" || code === "4_wheeler_non_ac" || code === "4_wheeler") {
    return true;
  }
  return null;
}
