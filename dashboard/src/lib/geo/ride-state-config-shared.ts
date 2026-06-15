/** Client-safe types/constants for ride state limits & surge admin UI. */

export type RideVehiclePricingType =
  | "2_wheeler"
  | "3_wheeler"
  | "4_wheeler_non_ac"
  | "4_wheeler_ac";

export const RIDE_VEHICLE_LIMIT_TYPES: RideVehiclePricingType[] = [
  "2_wheeler",
  "3_wheeler",
  "4_wheeler_non_ac",
  "4_wheeler_ac",
];

export const RIDE_VEHICLE_LIMIT_LABELS: Record<RideVehiclePricingType, string> = {
  "2_wheeler": "2 Wheeler",
  "3_wheeler": "3 Wheeler",
  "4_wheeler_non_ac": "4 Wheeler Non AC",
  "4_wheeler_ac": "4 Wheeler AC",
};

export type RideVehicleLimitRow = {
  id: number;
  stateId: string;
  vehicleType: RideVehiclePricingType;
  maxDistanceKm: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StateSurgeType = "fixed" | "percentage";
export type StateSurgeVehicleScope =
  | "all"
  | "2_wheeler"
  | "3_wheeler"
  | "4_wheeler_non_ac"
  | "4_wheeler_ac";

export type StateSurgeRow = {
  id: number;
  stateId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  surgeType: StateSurgeType;
  amount: number;
  vehicleType: StateSurgeVehicleScope;
  appliesFood: boolean;
  appliesParcel: boolean;
  appliesRide: boolean;
  maxRidersOnly: boolean;
  priority: number;
  manualActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StateSurgeTimeSlotRow = {
  id: number;
  stateSurgeId: number;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isEnabled: boolean;
};

/** Built-in rider payout surge catalog (one set per state, seeded disabled with ₹0). */
export const DEFAULT_STATE_SURGE_NAMES = [
  "Peak Hour Surge",
  "Rain Surge",
  "Festival Surge",
  "Night Surge",
] as const;

export type DefaultStateSurgeName = (typeof DEFAULT_STATE_SURGE_NAMES)[number];

export function isDefaultStateSurgeName(name: string): boolean {
  return (DEFAULT_STATE_SURGE_NAMES as readonly string[]).includes(name.trim());
}

export type StateSurgeSettings = {
  stateId: string;
  /** Max total surge ₹ rider receives per order when multiple rules apply. Null = no cap. */
  maxTotalSurgeAmount: number | null;
};

/** Seed windows only — runtime always reads state_surge_time_slots per state. */
export const STATE_SURGE_SEED_TIME_SLOTS: Record<
  DefaultStateSurgeName,
  Array<{ startTime: string; endTime: string }>
> = {
  "Peak Hour Surge": [
    { startTime: "11:00", endTime: "15:00" },
    { startTime: "19:00", endTime: "22:00" },
  ],
  "Rain Surge": [],
  "Festival Surge": [],
  "Night Surge": [{ startTime: "23:00", endTime: "03:00" }],
};

export function surgeUsesTimeSlots(name: string): boolean {
  const n = name.trim() as DefaultStateSurgeName;
  return (STATE_SURGE_SEED_TIME_SLOTS[n]?.length ?? 0) > 0
    || name.toLowerCase().includes("peak")
    || name.toLowerCase().includes("night");
}
