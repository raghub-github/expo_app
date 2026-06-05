export type OnboardingVehicleFlow = "dl_rc" | "rental_ev" | "payment";

export type OnboardingVehicleDocRequirements = {
  required_docs?: string[];
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

export const FALLBACK_ONBOARDING_VEHICLE_CATEGORIES: OnboardingVehicleCategory[] = [
  {
    id: 1,
    code: "2_wheeler",
    label: "2 Wheeler",
    hint: "Bicycle, Bike, Scooter & more",
    icon: "bicycle-outline",
    wheelCount: 2,
    sortOrder: 1,
    isActive: true,
  },
  {
    id: 2,
    code: "3_wheeler",
    label: "3 Wheeler",
    hint: "Auto, EV Auto, Cargo & Loader",
    icon: "bus-outline",
    wheelCount: 3,
    sortOrder: 2,
    isActive: true,
  },
  {
    id: 3,
    code: "4_wheeler",
    label: "4 Wheeler",
    hint: "Ace, Pickup, Van & Mini Truck",
    icon: "car-sport-outline",
    wheelCount: 4,
    sortOrder: 3,
    isActive: true,
  },
];

export const FALLBACK_ONBOARDING_VEHICLE_TYPES: OnboardingVehicleType[] = [
  {
    id: 101,
    code: "bicycle",
    categoryCode: "2_wheeler",
    label: "Bicycle",
    hint: "No DL required",
    icon: "bicycle-outline",
    sortOrder: 1,
    isActive: true,
    onboardingFlow: "payment",
    documentRequirements: { required_docs: [], has_own_vehicle: false },
    infoMessage: "No vehicle documents required. Continue to payment.",
    mapsToVehicleType: "cycle",
  },
  {
    id: 102,
    code: "e_cycle",
    categoryCode: "2_wheeler",
    label: "E-Cycle",
    hint: "Electric cycle",
    icon: "battery-half-outline",
    sortOrder: 2,
    isActive: true,
    onboardingFlow: "payment",
    documentRequirements: { required_docs: [], has_own_vehicle: false },
    infoMessage: "No vehicle documents required. Continue to payment.",
    mapsToVehicleType: "e_cycle",
  },
  {
    id: 103,
    code: "bike",
    categoryCode: "2_wheeler",
    label: "Bike",
    hint: "DL & RC required",
    icon: "speedometer-outline",
    sortOrder: 3,
    isActive: true,
    onboardingFlow: "dl_rc",
    documentRequirements: { required_docs: ["dl", "rc"], has_own_vehicle: true },
    infoMessage: null,
    mapsToVehicleType: "bike",
  },
  {
    id: 104,
    code: "scooter",
    categoryCode: "2_wheeler",
    label: "Scooter",
    hint: "DL & RC required",
    icon: "navigate-outline",
    sortOrder: 4,
    isActive: true,
    onboardingFlow: "dl_rc",
    documentRequirements: { required_docs: ["dl", "rc"], has_own_vehicle: true },
    infoMessage: null,
    mapsToVehicleType: "scooter",
  },
  {
    id: 105,
    code: "ev_bike",
    categoryCode: "2_wheeler",
    label: "EV Bike",
    hint: "Rental or EV proof required",
    icon: "flash-outline",
    sortOrder: 5,
    isActive: true,
    onboardingFlow: "rental_ev",
    documentRequirements: {
      required_docs: ["rental_proof", "ev_proof"],
      has_own_vehicle: false,
      requires_max_speed: true,
    },
    infoMessage: "Upload rental agreement or EV ownership proof on the next screen.",
    mapsToVehicleType: "ev_bike",
  },
  {
    id: 201,
    code: "auto_rickshaw",
    categoryCode: "3_wheeler",
    label: "Auto Rickshaw",
    hint: "DL & RC required",
    icon: "car-outline",
    sortOrder: 1,
    isActive: true,
    onboardingFlow: "dl_rc",
    documentRequirements: { required_docs: ["dl", "rc"], has_own_vehicle: true },
    infoMessage: null,
    mapsToVehicleType: "auto",
  },
  {
    id: 202,
    code: "ev_auto",
    categoryCode: "3_wheeler",
    label: "EV Auto",
    hint: "Rental or EV proof required",
    icon: "flash-outline",
    sortOrder: 2,
    isActive: true,
    onboardingFlow: "rental_ev",
    documentRequirements: {
      required_docs: ["rental_proof", "ev_proof"],
      has_own_vehicle: false,
      requires_max_speed: true,
    },
    infoMessage: "Upload rental agreement or EV ownership proof on the next screen.",
    mapsToVehicleType: "ev_auto",
  },
  {
    id: 203,
    code: "cargo_auto",
    categoryCode: "3_wheeler",
    label: "Cargo Auto",
    hint: "DL & RC required",
    icon: "cube-outline",
    sortOrder: 3,
    isActive: true,
    onboardingFlow: "dl_rc",
    documentRequirements: { required_docs: ["dl", "rc"], has_own_vehicle: true },
    infoMessage: null,
    mapsToVehicleType: "cargo_auto",
  },
  {
    id: 204,
    code: "loader_auto",
    categoryCode: "3_wheeler",
    label: "Loader Auto",
    hint: "DL & RC required",
    icon: "construct-outline",
    sortOrder: 4,
    isActive: true,
    onboardingFlow: "dl_rc",
    documentRequirements: { required_docs: ["dl", "rc"], has_own_vehicle: true },
    infoMessage: null,
    mapsToVehicleType: "loader_auto",
  },
  {
    id: 301,
    code: "tata_ace",
    categoryCode: "4_wheeler",
    label: "Tata Ace",
    hint: "DL & RC required",
    icon: "bus-outline",
    sortOrder: 1,
    isActive: true,
    onboardingFlow: "dl_rc",
    documentRequirements: { required_docs: ["dl", "rc"], has_own_vehicle: true },
    infoMessage: null,
    mapsToVehicleType: "tata_ace",
  },
  {
    id: 302,
    code: "pickup",
    categoryCode: "4_wheeler",
    label: "Pickup",
    hint: "DL & RC required",
    icon: "car-sport-outline",
    sortOrder: 2,
    isActive: true,
    onboardingFlow: "dl_rc",
    documentRequirements: { required_docs: ["dl", "rc"], has_own_vehicle: true },
    infoMessage: null,
    mapsToVehicleType: "pickup",
  },
  {
    id: 303,
    code: "cargo_van",
    categoryCode: "4_wheeler",
    label: "Cargo Van",
    hint: "DL & RC required",
    icon: "cube-outline",
    sortOrder: 3,
    isActive: true,
    onboardingFlow: "dl_rc",
    documentRequirements: { required_docs: ["dl", "rc"], has_own_vehicle: true },
    infoMessage: null,
    mapsToVehicleType: "cargo_van",
  },
  {
    id: 304,
    code: "mini_truck",
    categoryCode: "4_wheeler",
    label: "Mini Truck",
    hint: "DL & RC required",
    icon: "train-outline",
    sortOrder: 4,
    isActive: true,
    onboardingFlow: "dl_rc",
    documentRequirements: { required_docs: ["dl", "rc"], has_own_vehicle: true },
    infoMessage: null,
    mapsToVehicleType: "mini_truck",
  },
];

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
    .filter((t) => t.categoryCode === categoryCode)
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

export function buildCategoryHint(
  category: OnboardingVehicleCategory,
  types: OnboardingVehicleType[]
): string {
  const names = vehiclesForCategory(types, category.code)
    .filter((t) => t.isActive)
    .map((t) => t.label);
  if (names.length) return names.join(", ");
  return category.hint ?? "";
}
