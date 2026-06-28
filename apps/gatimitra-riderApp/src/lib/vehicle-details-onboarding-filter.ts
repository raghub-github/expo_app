import {
  findVehicleType,
  formatVehicleRowTitle,
  type OnboardingVehicleType,
} from "@/src/lib/onboarding-vehicle-types";
import {
  RIDER_FUEL_TYPE_OPTIONS,
  RIDER_VEHICLE_TYPE_OPTIONS,
} from "@/src/lib/rider-vehicle-options";

const OTHER_VEHICLE_TYPE = "other";

const FORM_VEHICLE_TYPE_VALUES = new Set(RIDER_VEHICLE_TYPE_OPTIONS.map((o) => o.value));

/** Catalog `maps_to_vehicle_type` → vehicle details form enum. */
const CATALOG_TO_FORM_VEHICLE_TYPE: Record<string, string> = {
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

export type VehicleDetailsOnboardingFilter = {
  /** Options to render in the vehicle type picker (empty = show locked label only). */
  vehicleTypeOptions: typeof RIDER_VEHICLE_TYPE_OPTIONS;
  /** Resolved form vehicle type from onboarding. */
  resolvedVehicleType: string;
  /** When resolved type is `other`, prefill custom type label. */
  customTypeLabel: string | null;
  /** Human-readable label from onboarding catalog. */
  onboardingDisplayLabel: string;
  /** Hide vehicle type picker — rider already chose during onboarding. */
  lockVehicleType: boolean;
  fuelTypeOptions: typeof RIDER_FUEL_TYPE_OPTIONS;
  /** Default fuel when only one option applies. */
  defaultFuelType: string | null;
  hideFuelType: boolean;
};

function resolveFormVehicleTypeFromCatalog(
  mapsTo: string | null | undefined,
  catalogLabel: string
): { vehicleType: string; customTypeLabel: string | null } {
  const raw = mapsTo?.trim().toLowerCase();
  if (!raw) {
    return { vehicleType: "bike", customTypeLabel: null };
  }
  if (FORM_VEHICLE_TYPE_VALUES.has(raw)) {
    return { vehicleType: raw, customTypeLabel: null };
  }
  const alias = CATALOG_TO_FORM_VEHICLE_TYPE[raw];
  if (alias) {
    return { vehicleType: alias, customTypeLabel: null };
  }
  if (CATALOG_OTHER_VEHICLE_TYPES.has(raw)) {
    return { vehicleType: OTHER_VEHICLE_TYPE, customTypeLabel: catalogLabel };
  }
  return { vehicleType: OTHER_VEHICLE_TYPE, customTypeLabel: catalogLabel || raw };
}

function fuelOptionsForFormVehicleType(vehicleType: string): {
  options: typeof RIDER_FUEL_TYPE_OPTIONS;
  defaultFuel: string | null;
  hide: boolean;
} {
  if (vehicleType === "cycle") {
    return { options: [], defaultFuel: null, hide: true };
  }
  if (vehicleType === "ev_bike" || vehicleType === "ev_auto" || vehicleType === "ev_car") {
    return {
      options: RIDER_FUEL_TYPE_OPTIONS.filter((o) => o.value === "electric"),
      defaultFuel: "electric",
      hide: false,
    };
  }
  if (vehicleType === "cng_auto") {
    return {
      options: RIDER_FUEL_TYPE_OPTIONS.filter((o) => o.value === "cng" || o.value === "petrol"),
      defaultFuel: "cng",
      hide: false,
    };
  }
  if (vehicleType === "e_rickshaw") {
    return {
      options: RIDER_FUEL_TYPE_OPTIONS.filter((o) => o.value === "electric"),
      defaultFuel: "electric",
      hide: false,
    };
  }
  return {
    options: RIDER_FUEL_TYPE_OPTIONS.filter((o) => o.value !== "electric"),
    defaultFuel: "petrol",
    hide: false,
  };
}

export function buildVehicleDetailsOnboardingFilter(args: {
  vehicleChoice?: string | null;
  vehicleCategoryCode?: string | null;
  onboardingTypes: OnboardingVehicleType[];
  /** Existing saved vehicle type — keep when editing incomplete profile. */
  existingVehicleType?: string | null;
}): VehicleDetailsOnboardingFilter | null {
  const choice = args.vehicleChoice?.trim();
  if (!choice) return null;

  const catalogRow = findVehicleType(args.onboardingTypes, choice);
  if (!catalogRow) return null;

  const onboardingDisplayLabel = formatVehicleRowTitle(catalogRow);
  const { vehicleType, customTypeLabel } = resolveFormVehicleTypeFromCatalog(
    catalogRow.mapsToVehicleType ?? catalogRow.code,
    onboardingDisplayLabel
  );

  const matchedOption = RIDER_VEHICLE_TYPE_OPTIONS.find((o) => o.value === vehicleType);
  const vehicleTypeOptions = matchedOption ? [matchedOption] : [];

  const fuel = fuelOptionsForFormVehicleType(vehicleType);

  return {
    vehicleTypeOptions,
    resolvedVehicleType: args.existingVehicleType?.trim() || vehicleType,
    customTypeLabel,
    onboardingDisplayLabel,
    lockVehicleType: true,
    fuelTypeOptions: fuel.options,
    defaultFuelType: fuel.defaultFuel,
    hideFuelType: fuel.hide,
  };
}
