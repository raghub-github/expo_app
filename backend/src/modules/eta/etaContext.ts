/**
 * Soft-context resolvers for the ETA engine.
 *
 * These three signals (weather, peak window, drop context) gate the
 * multipliers that adjust the raw critical-path ETA. Each resolver returns
 * a deterministic default when the underlying signal isn't wired yet,
 * so the engine never blocks on a missing provider — when (e.g.) a real
 * weather API gets plugged in, swap the stub for a real fetch with
 * no engine changes.
 */

export type WeatherState =
  | "CLEAR"
  | "LIGHT_RAIN"
  | "MODERATE_RAIN"
  | "HEAVY_RAIN"
  | "EXTREME_WEATHER";
export type PeakWindow = "NORMAL" | "LUNCH_RUSH" | "DINNER_RUSH" | "FESTIVAL_PEAK";
export type DropContext = "HOUSE" | "APARTMENT" | "OFFICE" | "MALL" | "GATED";

/* ─── Weather (stub) ────────────────────────────────────────────── */

export function weatherMultiplier(state: WeatherState): number {
  switch (state) {
    case "CLEAR":
      return 1.0;
    case "LIGHT_RAIN":
      return 1.08;
    case "MODERATE_RAIN":
      return 1.15;
    case "HEAVY_RAIN":
      return 1.25;
    case "EXTREME_WEATHER":
      return 1.5;
  }
}

/** Resolves weather via shared zone cache (no direct Open-Meteo calls from ETA). */
export async function resolveWeatherState(
  lat: number,
  lng: number,
  _now?: Date,
): Promise<WeatherState> {
  try {
    const { toEtaEngineWeatherState } = await import("../weather/weather.classify.js");
    const { getWeatherSeverityForCoords } = await import("../weather/weather.service.js");
    const severity = await getWeatherSeverityForCoords(lat, lng);
    return toEtaEngineWeatherState(severity);
  } catch {
    return "CLEAR";
  }
}

/* ─── Peak hour (IST clock based) ───────────────────────────────── */

export function peakHourMultiplier(window: PeakWindow): number {
  switch (window) {
    case "NORMAL": return 1.0;
    case "LUNCH_RUSH": return 1.15;
    case "DINNER_RUSH": return 1.25;
    case "FESTIVAL_PEAK": return 1.4;
  }
}

/**
 * IST-time-of-day → peak window. Festival peaks need an override flag
 * (events table or env switch); we default to one of the three regular
 * windows when nothing overrides.
 */
export function resolvePeakWindow(opts?: {
  now?: Date;
  festivalActive?: boolean;
}): PeakWindow {
  if (opts?.festivalActive) return "FESTIVAL_PEAK";
  const t = opts?.now ?? new Date();
  const istHour = new Date(t.getTime() + 5.5 * 60 * 60 * 1000).getUTCHours();
  if (istHour >= 12 && istHour < 14) return "LUNCH_RUSH";
  if (istHour >= 19 && istHour < 22) return "DINNER_RUSH";
  return "NORMAL";
}

/* ─── Drop context (heuristic from address) ─────────────────────── */

const DROP_CONTEXT_BUFFERS: Record<DropContext, number> = {
  HOUSE: 2,
  APARTMENT: 5,
  GATED: 4,
  OFFICE: 6,
  MALL: 8,
};

export function apartmentBufferMinutes(ctx: DropContext): number {
  return DROP_CONTEXT_BUFFERS[ctx];
}

/**
 * Heuristic classifier — scans the address string for known keywords.
 * Returns HOUSE when nothing matches (most permissive default). This is
 * good enough until the address form actually asks the customer to pick
 * a type (the right long-term fix).
 */
export function classifyDropContext(addressLine: string | null | undefined): DropContext {
  if (!addressLine) return "HOUSE";
  const s = String(addressLine).toLowerCase();
  if (/\b(mall|emporium|shopping centre|shopping center)\b/.test(s)) return "MALL";
  if (/\b(office|corporate|tower|tech park|business park|it park|sez)\b/.test(s)) return "OFFICE";
  if (/\b(gated|society|enclave|colony residency)\b/.test(s)) return "GATED";
  if (/\b(apartment|apt|flat|residency|residences|block|building|highrise|hi-?rise)\b/.test(s)) return "APARTMENT";
  return "HOUSE";
}

/* ─── Mapbox traffic multiplier ─────────────────────────────────── */

/**
 * Mapbox's `driving-traffic` profile returns a duration that already includes
 * congestion. When the caller also supplies a free-flow `driving` duration
 * we can compute an explicit traffic multiplier (>= 1.0). Otherwise we
 * derive an implied multiplier from the peak window so the engine still
 * accounts for typical congestion.
 */
export function trafficMultiplierFromRoute(args: {
  freeFlowMinutes?: number | null;
  trafficAwareMinutes?: number | null;
  peakWindow?: PeakWindow;
}): number {
  const free = args.freeFlowMinutes ?? null;
  const trafficked = args.trafficAwareMinutes ?? null;
  if (free && trafficked && free > 0) {
    const m = trafficked / free;
    if (Number.isFinite(m) && m >= 0.9 && m <= 3) return Math.max(1, Number(m.toFixed(2)));
  }
  // Fallback: derive from peak window (Mapbox `driving-traffic` already
  // bakes in some congestion, so this acts as a top-up only).
  switch (args.peakWindow ?? "NORMAL") {
    case "FESTIVAL_PEAK": return 1.35;
    case "DINNER_RUSH": return 1.2;
    case "LUNCH_RUSH": return 1.12;
    case "NORMAL":
    default:
      return 1.0;
  }
}
