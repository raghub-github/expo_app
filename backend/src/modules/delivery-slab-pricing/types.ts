export type DeliveryActorType = "customer" | "rider";

export type DeliveryServiceType = "food" | "parcel" | "person_ride";

export type DeliveryRateSlabRow = {
  id: number;
  geoLevel: string;
  geoRefId: string;
  serviceType: DeliveryServiceType;
  actorType: DeliveryActorType;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  /** Rider-only: waiting payout per minute. Stored on first slab conventionally. */
  waitingChargePerMin?: number | null;
  /** Rider-only: surge multiplier (>=1). Stored on first slab conventionally. */
  surgeMultiplier?: number | null;
  priority: number;
  isActive: boolean;
};

export type ProgressiveSlabSegment = {
  slabId: number;
  minKm: number;
  maxKm: number | null;
  segmentKm: number;
  perKmRate: number;
  segmentAmount: number;
};

export type ProgressiveSlabQuote = {
  distanceKm: number;
  baseFareApplied: number;
  segments: ProgressiveSlabSegment[];
  preMinChargeTotal: number;
  minChargeApplied: number;
  /** Optional rider-only components (if passed in calc). */
  waitingMinutes?: number;
  waitingAmount?: number;
  surgeMultiplierApplied?: number;
  finalAmount: number;
};

