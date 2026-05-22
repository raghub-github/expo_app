/**
 * Pre-order ETA preview — single formula every customer-facing surface uses.
 *
 * v2 implementation: routes through the full critical-path engine internally
 * but exposes the same simple shape the list / merchant detail / billing
 * payloads were already stamping. Same call, smarter math.
 *
 * Why this still exists as its own file:
 *   - Pre-order surfaces don't have an order id yet → can't load items.
 *     They pass only `prepMinutes` (store-level avg). The engine treats this
 *     as a one-item synthetic cart with kpt = avg, qty = 1.
 *   - List endpoints can't make Mapbox calls per row; the caller supplies
 *     a Haversine-derived `distanceKm` and we extrapolate `routeMinutes`
 *     at 18 km/h city avg.
 *   - The engine handles all the multipliers; we just pass the inputs.
 */

import { computeEta } from "./eta.engine.js";

const AVG_CITY_KMPH = 18;
const MIN_LEG_MINUTES = 8;

export type EtaPreviewRange = {
  etaMinMinutes: number;
  etaMaxMinutes: number;
  /** Optional internal split for debugging — never shown to customers. */
  internal: { prepMinutes: number; routeMinutes: number };
};

export function previewEtaRange(args: {
  distanceKm: number | null | undefined;
  prepMinutes: number | null | undefined;
}): EtaPreviewRange {
  const distance =
    Number.isFinite(args.distanceKm) && (args.distanceKm ?? 0) > 0 ? Number(args.distanceKm) : 0;
  const prep =
    Number.isFinite(args.prepMinutes) && (args.prepMinutes ?? 0) > 0
      ? Math.round(Number(args.prepMinutes))
      : 18;
  const routeMinutes =
    distance > 0
      ? Math.max(MIN_LEG_MINUTES, Math.round((distance * 60) / AVG_CITY_KMPH))
      : MIN_LEG_MINUTES;

  // Run the canonical v2 engine. We can't load items at preview time, so we
  // synthesise one item with kpt = avg prep. activeOrders defaults to 0 so
  // we don't punish stores we haven't queried; the placement-time engine
  // will pick up the real load.
  const snap = computeEta({
    items: [{ kptMinutes: prep, quantity: 1 }],
    fallbackPrepMinutes: prep,
    routeMinutes,
    routeKm: distance,
    activeOrdersAtStore: 0,
    riderAssigned: false,
  });

  return {
    etaMinMinutes: snap.etaMinMinutes,
    etaMaxMinutes: snap.etaMaxMinutes,
    internal: { prepMinutes: prep, routeMinutes },
  };
}

/** Convenience: human-friendly label "45-55 mins" / "55 mins" when range is tight. */
export function formatEtaLabel(range: EtaPreviewRange): string {
  if (range.etaMaxMinutes - range.etaMinMinutes <= 1) return `${range.etaMaxMinutes} mins`;
  return `${range.etaMinMinutes}-${range.etaMaxMinutes} mins`;
}
