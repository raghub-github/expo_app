/**
 * Rider hot-zone pressure model — the deterministic demand/supply core.
 *
 * PURE functions only (no DB, no H3): a spatial cell's weighted demand and effective
 * supply go in, a status (NORMAL/WARM/HOT/CRITICAL) comes out. This is the algorithm
 * the whole hot-zone engine is built on; keeping it pure makes every business rule in
 * the master spec (min-demand gate, capacity-aware supply, time-decay, distance-decay,
 * hysteresis, configurable thresholds) exhaustively unit-testable without a database.
 *
 * Design rules honoured here:
 *  - Hot ≠ "a store is online" and ≠ "no riders". A cell is only elevated when there is
 *    MEANINGFUL demand (minWeightedDemand gate), so zero-demand cells are always NORMAL
 *    no matter how low supply is.
 *  - Supply is capacity-aware (remaining slots), not a head-count.
 *  - Pressure = weightedDemand / max(effectiveSupply, minSupplyFloor) so it never
 *    divides by zero and low supply raises — but cannot by itself create — pressure.
 *  - Thresholds/decays are configuration, never hard-coded business policy.
 *  - Hysteresis prevents HOT↔NORMAL flapping on small fluctuations.
 */

export type ZoneStatus = "NORMAL" | "WARM" | "HOT" | "CRITICAL";

export type HotZoneConfig = {
  /** Enter WARM/HOT/CRITICAL at pressure >= these (must be ascending). */
  warmAt: number;
  hotAt: number;
  criticalAt: number;
  /** Hysteresis: to LEAVE a level, pressure must fall below (enterThreshold - margin). */
  hysteresisMargin: number;
  /** Min weighted demand for a cell to exceed NORMAL (kills 1-order false hotspots). */
  minWeightedDemand: number;
  /** Supply floor in the denominator so pressure is finite when real supply is ~0. */
  minSupplyFloor: number;
  /** Demand time-decay half-life (seconds): an order this old counts half. */
  demandHalfLifeSeconds: number;
  /** Per-H3-ring supply decay for neighbouring-cell influence (0..1). */
  supplyRingDecay: number;
};

/**
 * Sensible defaults (all overridable from Super-Admin config). Chosen for the current
 * scale; the values are examples, the model is what matters.
 */
export const DEFAULT_HOT_ZONE_CONFIG: HotZoneConfig = {
  warmAt: 1.0,
  hotAt: 1.5,
  criticalAt: 2.0,
  hysteresisMargin: 0.25,
  minWeightedDemand: 3,
  minSupplyFloor: 0.5,
  demandHalfLifeSeconds: 600, // 10 min
  supplyRingDecay: 0.5,
};

const STATUS_RANK: Record<ZoneStatus, number> = { NORMAL: 0, WARM: 1, HOT: 2, CRITICAL: 3 };

/** Time-decayed weight of one demand event (recent orders dominate — Part 22/25/26). */
export function demandWeight(orderAgeSeconds: number, cfg: HotZoneConfig): number {
  if (!Number.isFinite(orderAgeSeconds) || orderAgeSeconds <= 0) return 1;
  if (cfg.demandHalfLifeSeconds <= 0) return 1;
  return Math.pow(0.5, orderAgeSeconds / cfg.demandHalfLifeSeconds);
}

/**
 * One eligible rider's supply contribution to a cell: remaining capacity, decayed by
 * how many H3 rings away the rider sits (Part 19/23). ringDistance 0 = same cell.
 * A rider at max capacity contributes 0; a stale/ineligible rider must be excluded by
 * the caller (freshness/service/vehicle live in the canonical availability engine).
 */
export function supplyContribution(
  remainingCapacity: number,
  ringDistance: number,
  cfg: HotZoneConfig
): number {
  const cap = Math.max(0, Number(remainingCapacity) || 0);
  if (cap === 0) return 0;
  const rings = Math.max(0, Math.floor(ringDistance) || 0);
  const decay = Math.pow(Math.min(1, Math.max(0, cfg.supplyRingDecay)), rings);
  return cap * decay;
}

/** Pressure = demand / max(supply, floor). Never divides by zero (Part 20/22). */
export function pressureScore(
  weightedDemand: number,
  effectiveSupply: number,
  cfg: HotZoneConfig
): number {
  const d = Math.max(0, Number(weightedDemand) || 0);
  const s = Math.max(cfg.minSupplyFloor, Number(effectiveSupply) || 0);
  return d / s;
}

/**
 * Classify a cell. Honours the min-demand gate (zero/low demand → NORMAL regardless of
 * supply), the configurable enter thresholds, and hysteresis on the way down: a cell
 * already at a level stays there until pressure falls below (enterThreshold - margin).
 */
export function classifyZone(args: {
  weightedDemand: number;
  effectiveSupply: number;
  prevStatus?: ZoneStatus;
  cfg: HotZoneConfig;
}): { status: ZoneStatus; pressure: number } {
  const { weightedDemand, effectiveSupply, prevStatus = "NORMAL", cfg } = args;

  // Min-demand gate: without meaningful demand a cell is NEVER hot — this is what stops
  // "merchant online / no riders" from lighting up a zone (Part 21/22/39/40).
  if ((Number(weightedDemand) || 0) < cfg.minWeightedDemand) {
    return { status: "NORMAL", pressure: 0 };
  }

  const pressure = pressureScore(weightedDemand, effectiveSupply, cfg);

  const levelFor = (p: number, margin: number): ZoneStatus => {
    if (p >= cfg.criticalAt - margin) return "CRITICAL";
    if (p >= cfg.hotAt - margin) return "HOT";
    if (p >= cfg.warmAt - margin) return "WARM";
    return "NORMAL";
  };

  const rising = levelFor(pressure, 0); // strict enter thresholds
  const sticky = levelFor(pressure, cfg.hysteresisMargin); // relaxed leave thresholds

  // Rising or holding → use enter thresholds. Falling from a higher prior level → allow
  // the relaxed (sticky) level so we don't flap on tiny dips.
  const status =
    STATUS_RANK[rising] >= STATUS_RANK[prevStatus] ? rising : sticky;

  return { status, pressure };
}
