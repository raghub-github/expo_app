/**
 * ETA Engine v2 — production-grade critical-path delivery ETA.
 *
 * KEY DIFFERENCES vs v1:
 *   * Food prep uses MAX(item_kpt) (critical-path), NOT average / sum.
 *   * Logarithmic complexity scaling on item count + quantity.
 *   * Step-function kitchen load buffer driven by active-orders count.
 *   * Critical-path matching: food_prep || rider_arrival (whichever is later).
 *   * Mapbox `driving-traffic` aware (caller passes traffic-adjusted minutes).
 *   * Explicit weather / peak-hour / drop-context multipliers.
 *   * Uncertainty margin → eta_min / eta_max range, never a single number.
 *   * Confidence score derived from how many signals are known vs assumed.
 *
 * FORMULA:
 *   food_prep      = MAX(items[].kpt) + complexity_buffer + kitchen_load_buffer
 *   rider_arrival  = rider_assignment_delay + rider_to_store
 *                    (all multiplied by traffic & weather)
 *   critical_path  = max(food_prep, rider_arrival)
 *   travel         = route_minutes * traffic_multiplier * weather_multiplier
 *   raw_eta        = critical_path + pickup_buffer + travel + apartment_buffer
 *   adjusted_eta   = raw_eta * peak_hour_multiplier
 *   eta_max        = ceil(adjusted_eta + uncertainty_margin)
 *   eta_min        = max(eta_max - 10, ceil(adjusted_eta - 2))
 *
 * Pure / deterministic — IO (DB, weather provider) sits in callers so this
 * file stays testable and ML-friendly (every input fed in is in args).
 */

import { getSql } from "../../db/client.js";
import {
  apartmentBufferMinutes,
  classifyDropContext,
  peakHourMultiplier,
  resolvePeakWindow,
  resolveWeatherState,
  trafficMultiplierFromRoute,
  weatherMultiplier,
  type DropContext,
  type PeakWindow,
  type WeatherState,
} from "./etaContext.js";
import { kitchenLoadBufferMinutes } from "./restaurantLoad.js";

export const ETA_ENGINE_VERSION = "v2.1";

export type EtaItem = {
  itemId?: string | number;
  /** Per-item kitchen prep time in minutes. */
  kptMinutes: number;
  quantity: number;
};

export type EtaInputs = {
  /** Items being prepared. Empty → falls back to store-level prep average. */
  items: EtaItem[];
  /** Fallback when items is empty or every item is missing kpt (e.g. v1 callers). */
  fallbackPrepMinutes?: number;

  /** Mapbox driving-traffic minutes from store → customer. */
  routeMinutes: number;
  /** Free-flow (no-traffic) minutes if you have both; lets us derive traffic_multiplier. */
  freeFlowRouteMinutes?: number | null;
  /** Road distance, km. */
  routeKm: number;

  /** Store load: count of in-flight orders right now. */
  activeOrdersAtStore: number;

  /** Rider context — supply what you know; defaults fill the rest. */
  riderAssigned?: boolean;
  riderToStoreMinutes?: number | null;
  /** How long, on average, an order waits to be claimed by a rider. */
  riderAssignmentDelayMinutes?: number;

  /** Soft context — engine resolves defaults when omitted. */
  weather?: WeatherState | null;
  peakWindow?: PeakWindow | null;
  dropContext?: DropContext | null;
  /** Free-text address line; used to classify dropContext when not provided. */
  dropAddress?: string | null;

  /** When the ETA is being computed (used for peak-window detection). */
  now?: Date;
};

export type EtaSnapshot = {
  /** Customer-visible range — never a single magic number. */
  etaMinMinutes: number;
  etaMaxMinutes: number;
  promisedDeliveryAt: string;

  /** Full critical-path breakdown — every minute traces back to an input. */
  breakdown: {
    foodPrepMinutes: number;
    kitchenLoadBufferMinutes: number;
    riderAssignmentMinutes: number;
    riderToStoreMinutes: number;
    riderArrivalMinutes: number;
    criticalPathMinutes: number;
    pickupBufferMinutes: number;
    travelMinutes: number;
    apartmentBufferMinutes: number;
    /** ceil(adjusted_eta) before uncertainty band — useful for promised_at. */
    adjustedEtaMinutes: number;
    uncertaintyMarginMinutes: number;
  };

  /** Multipliers actually applied — stored for analytics. */
  multipliers: {
    traffic: number;
    weather: number;
    peakHour: number;
  };

  /** Context inputs the engine inferred / resolved. */
  context: {
    weather: WeatherState;
    peakWindow: PeakWindow;
    dropContext: DropContext;
    activeOrdersAtStore: number;
  };

  routeKm: number;
  confidenceScore: number;
  engineVersion: string;
  generatedAt: string;
};

const SCALING_FACTOR_COMPLEXITY = 4;
const DEFAULT_PREP_FALLBACK_MIN = 18;
const DEFAULT_RIDER_ASSIGNMENT_MIN = 4;
const DEFAULT_RIDER_TO_STORE_MIN = 6;
const PICKUP_BUFFER_BASE_MIN = 3;
const PICKUP_BUFFER_MAX_MIN = 8;

/* ───────────────────────── Building blocks ───────────────────────── */

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function safeCeil(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0;
}

/** Critical-path prep time = MAX of item KPTs, never the sum. */
function criticalPathPrep(items: EtaItem[], fallbackPrepMinutes?: number): number {
  const kpts = items
    .map((it) => Number(it.kptMinutes))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (kpts.length === 0) {
    return Math.max(1, Math.round(fallbackPrepMinutes ?? DEFAULT_PREP_FALLBACK_MIN));
  }
  return Math.max(...kpts);
}

/** Logarithmic scaling for multi-item complexity. */
function complexityBuffer(items: EtaItem[]): number {
  const totalItems = items.length;
  const totalQty = items.reduce((s, it) => s + Math.max(0, Number(it.quantity) || 0), 0);
  const x = totalItems + totalQty;
  if (x <= 1) return 0;
  // log2 because base-2 keeps small carts honest (cart=3 items → ~2 min; cart=10 → ~3.5).
  return Math.round(Math.log2(x) * SCALING_FACTOR_COMPLEXITY);
}

/** Pickup buffer scales with load + qty so chaotic kitchens get more grace. */
function pickupBufferMinutes(activeOrders: number, totalQty: number): number {
  let buf = PICKUP_BUFFER_BASE_MIN;
  if (activeOrders > 10) buf += 1;
  if (activeOrders > 20) buf += 2;
  if (totalQty > 5) buf += 1;
  if (totalQty > 12) buf += 1;
  return Math.min(buf, PICKUP_BUFFER_MAX_MIN);
}

function confidenceScore(args: {
  riderAssigned: boolean;
  activeOrders: number;
  weather: WeatherState;
  peakWindow: PeakWindow;
  routeKm: number;
}): number {
  let c = 0.95;
  if (!args.riderAssigned) c -= 0.05;
  if (args.activeOrders > 15) c -= 0.05;
  if (args.activeOrders > 30) c -= 0.05;
  if (args.weather === "LIGHT_RAIN") c -= 0.02;
  if (args.weather === "MODERATE_RAIN") c -= 0.05;
  if (args.weather === "HEAVY_RAIN") c -= 0.07;
  if (args.weather === "EXTREME_WEATHER") c -= 0.12;
  if (args.peakWindow === "LUNCH_RUSH") c -= 0.04;
  if (args.peakWindow === "DINNER_RUSH") c -= 0.07;
  if (args.peakWindow === "FESTIVAL_PEAK") c -= 0.1;
  if (args.routeKm > 8) c -= 0.05;
  if (args.routeKm > 12) c -= 0.05;
  return clamp(Number(c.toFixed(2)), 0.4, 0.99);
}

/** Uncertainty margin = 10-25% of adjusted_eta, floor 5, ceiling 15. */
function uncertaintyMargin(adjustedEta: number, confidence: number): number {
  // Lower confidence → wider margin (range widens to set a beatable expectation).
  const pct = 0.1 + (1 - confidence) * 0.25;
  const raw = adjustedEta * pct;
  return clamp(Math.round(raw), 5, 15);
}

/* ───────────────────────── Engine entry ───────────────────────── */

export function computeEta(input: EtaInputs): EtaSnapshot {
  const now = input.now ?? new Date();

  // Context resolution — engine never trusts a missing signal.
  const weather: WeatherState = input.weather ?? "CLEAR";
  const peakWindow: PeakWindow = input.peakWindow ?? resolvePeakWindow({ now });
  const dropContext: DropContext = input.dropContext ?? classifyDropContext(input.dropAddress);

  const trafficMul = trafficMultiplierFromRoute({
    freeFlowMinutes: input.freeFlowRouteMinutes,
    trafficAwareMinutes: input.routeMinutes,
    peakWindow,
  });
  const weatherMul = weatherMultiplier(weather);
  const peakMul = peakHourMultiplier(peakWindow);

  /* Food preparation — critical path, never the sum */
  const items = Array.isArray(input.items) ? input.items : [];
  const totalQty = items.reduce((s, it) => s + Math.max(0, Number(it.quantity) || 0), 0);
  const prepCore = criticalPathPrep(items, input.fallbackPrepMinutes);
  const prepComplexity = complexityBuffer(items);
  const loadBuffer = kitchenLoadBufferMinutes(input.activeOrdersAtStore);
  const foodPrepMinutes = prepCore + prepComplexity + loadBuffer;

  /* Rider arrival — assignment delay + traffic-adjusted travel-to-store */
  const riderAssignmentMinutes = input.riderAssigned
    ? 0
    : Math.max(0, Math.round(input.riderAssignmentDelayMinutes ?? DEFAULT_RIDER_ASSIGNMENT_MIN));
  const riderToStoreBase = input.riderToStoreMinutes != null && Number.isFinite(input.riderToStoreMinutes)
    ? Math.max(1, Math.round(Number(input.riderToStoreMinutes)))
    : DEFAULT_RIDER_TO_STORE_MIN;
  const riderToStoreMinutes = Math.round(riderToStoreBase * trafficMul * weatherMul);
  const riderArrivalMinutes = riderAssignmentMinutes + riderToStoreMinutes;

  /* Critical-path: prep and rider arrival happen in parallel */
  const criticalPathMinutes = Math.max(foodPrepMinutes, riderArrivalMinutes);

  /* Pickup + travel + apartment */
  const pickupBuf = pickupBufferMinutes(input.activeOrdersAtStore, totalQty);
  const travelMinutes = Math.round(
    Math.max(1, Number(input.routeMinutes) || 0) * trafficMul * weatherMul,
  );
  const apartmentBuf = apartmentBufferMinutes(dropContext);

  const rawEta = criticalPathMinutes + pickupBuf + travelMinutes + apartmentBuf;
  const adjustedEta = Math.round(rawEta * peakMul);

  const conf = confidenceScore({
    riderAssigned: !!input.riderAssigned,
    activeOrders: input.activeOrdersAtStore,
    weather,
    peakWindow,
    routeKm: input.routeKm,
  });
  const margin = uncertaintyMargin(adjustedEta, conf);
  const etaMaxMinutes = safeCeil(adjustedEta + margin);
  const etaMinMinutes = Math.max(safeCeil(adjustedEta - 2), etaMaxMinutes - 10);

  const promisedDeliveryAt = new Date(now.getTime() + etaMaxMinutes * 60 * 1000).toISOString();

  return {
    etaMinMinutes,
    etaMaxMinutes,
    promisedDeliveryAt,
    breakdown: {
      foodPrepMinutes,
      kitchenLoadBufferMinutes: loadBuffer,
      riderAssignmentMinutes,
      riderToStoreMinutes,
      riderArrivalMinutes,
      criticalPathMinutes,
      pickupBufferMinutes: pickupBuf,
      travelMinutes,
      apartmentBufferMinutes: apartmentBuf,
      adjustedEtaMinutes: adjustedEta,
      uncertaintyMarginMinutes: margin,
    },
    multipliers: { traffic: trafficMul, weather: weatherMul, peakHour: peakMul },
    context: {
      weather,
      peakWindow,
      dropContext,
      activeOrdersAtStore: input.activeOrdersAtStore,
    },
    routeKm: Number((input.routeKm ?? 0).toFixed(2)),
    confidenceScore: conf,
    engineVersion: ETA_ENGINE_VERSION,
    generatedAt: now.toISOString(),
  };
}

/* ─── Helpers preserved for v1 callers ──────────────────────────── */

/**
 * Reads the merchant store's configured average preparation time.
 * v2 prefers per-item KPT, but this is still used as the fallback when the
 * caller has no items list (e.g. menu list cards in the customer app).
 */
export async function resolveStorePrepMinutes(storeId: number): Promise<number> {
  const { resolveBlendedStorePrepMinutes } = await import("./eta.merchant-prep-stats.js");
  return resolveBlendedStorePrepMinutes(storeId);
}

/** Re-export resolveWeatherState so callers can import everything from the engine. */
export { resolveWeatherState };
