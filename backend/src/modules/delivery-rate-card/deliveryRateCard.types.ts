export type ServiceType = "FOOD" | "PARCEL" | "RIDE" | "ALL";
export type DemandLevel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME" | "UNKNOWN";

export type RateCardRow = {
  id: number;
  name: string;
  serviceType: ServiceType | string;
  cityName: string | null;
  priority: number;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
};

export type DistanceSlabRow = {
  id: number;
  rateCardId: number;
  minKm: number | null;
  maxKm: number | null;
  baseFare: number;
  perKmRate: number;
  priority: number;
};

export type TimeSlotRow = {
  id: number;
  rateCardId: number;
  startMin: number;
  endMin: number;
  surgeMultiplier: number;
  isWeekendOnly: boolean;
};

export type ZoneRow = {
  id: number;
  rateCardId: number;
  zoneName: string | null;
  geojson: unknown;
  multiplier: number;
  priority: number;
  isActive: boolean;
};

export type SpecialDayRow = {
  id: number;
  day: string; // yyyy-mm-dd
  name: string | null;
  multiplier: number;
  isActive: boolean;
};

export type DemandLevelRow = {
  id: number;
  serviceType: ServiceType | string;
  demandLevel: DemandLevel | string;
  multiplier: number;
  isActive: boolean;
};

export type DeliveryRateCardDataset = {
  cards: RateCardRow[];
  slabs: DistanceSlabRow[];
  timeSlots: TimeSlotRow[];
  zones: ZoneRow[];
  specialDays: SpecialDayRow[];
  demandLevels: DemandLevelRow[];
};

export type DeliveryFeeRequest = {
  serviceType: ServiceType;
  cityName?: string | null;
  pickup: { lat: number; lng: number };
  drop: { lat: number; lng: number };
  distanceKm: number;
  now: Date;
  orderValue?: number;
  demandLevel?: DemandLevel;
};

export type DeliveryFeeResult = {
  distanceKm: number;
  baseFare: number;
  perKmRate: number;
  surgeMultiplier: number;
  zoneMultiplier: number;
  specialDayMultiplier: number;
  demandMultiplier: number;
  totalDeliveryFee: number;
  appliedRateCardId: number | null;
  appliedSlabId: number | null;
  appliedTimeSlotId: number | null;
  appliedZoneId: number | null;
  appliedSpecialDayId: number | null;
  demandLevel: DemandLevel;
  debug: Record<string, unknown>;
};

