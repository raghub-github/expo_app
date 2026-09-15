/**
 * Batch dispatch — route feasibility, insertion & cost (PURE, §15–22/§48/§101).
 *
 * Given a rider's current planned stops and a candidate order (its pickup + drop), find the best
 * feasible way to INSERT the candidate's two stops into the route, or reject with a machine-readable
 * reason. This is the soft-scoring core, but it enforces the SLA-ALWAYS-WINS hard constraint (§98):
 * a batch that would make ANY drop (existing or new) miss its promised time is rejected outright,
 * no matter how much distance it saves.
 *
 * Distance defaults to great-circle (haversine) so this is dependency-free and unit-testable; the
 * live wiring can inject a road-distance function (§25 — straight-line for pre-filter, road for the
 * final feasibility) via `distanceKm`.
 */

export type LatLng = { lat: number; lng: number };

export type RouteStop = {
  orderId: number;
  kind: "pickup" | "drop";
  loc: LatLng;
  /** DROP only: absolute SLA deadline (epoch ms) it must be delivered by. Undefined = no hard SLA. */
  deadlineMs?: number;
  /** PICKUP only: earliest ready time (epoch ms), e.g. food prep-ready. Undefined = ready now. */
  readyAtMs?: number;
  /** Same-store key (store id) — enables the same-store batching bonus. */
  storeKey?: string;
};

export type BatchRouteConfig = {
  avgSpeedKmph: number;
  pickupServiceMin: number;
  dropServiceMin: number;
  maxPickupDetourKm: number;
  maxPickupDetourMin: number;
  maxExtraDropDelayMin: number;
  sameStoreBonus: number;
};

export type BatchRouteInput = {
  riderLoc: LatLng;
  nowMs: number;
  /** The rider's remaining planned stops for current active order(s), in planned order. */
  existingStops: RouteStop[];
  candidatePickup: RouteStop; // kind "pickup"
  candidateDrop: RouteStop; // kind "drop"
  config: BatchRouteConfig;
  /** Optional road-distance fn (km). Defaults to haversine. */
  distanceKm?: (a: LatLng, b: LatLng) => number;
};

export type BatchRouteReason =
  | "SLA_RISK"
  | "EXTRA_DROP_DELAY_TOO_LARGE"
  | "PICKUP_DETOUR_TOO_LARGE"
  | "ROUTE_INFEASIBLE";

export type BatchRouteResult = {
  feasible: boolean;
  reason: BatchRouteReason | null;
  /** Lower is better. Composite added-time cost minus same-store bonus. */
  score: number;
  addedTravelMin: number;
  pickupDetourKm: number;
  maxExtraDropDelayMin: number;
  /** Best stop sequence (order + kind) when feasible. */
  sequence: Array<{ orderId: number; kind: "pickup" | "drop" }>;
};

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

type SimResult = {
  totalTravelMin: number;
  totalKm: number;
  /** arrival epoch ms at each stop, index-aligned to the sequence. */
  arrivalMs: number[];
  /** epoch ms a DROP was delivered, keyed by orderId. */
  dropDeliveredMs: Map<number, number>;
};

function simulate(
  riderLoc: LatLng,
  nowMs: number,
  seq: RouteStop[],
  cfg: BatchRouteConfig,
  dist: (a: LatLng, b: LatLng) => number
): SimResult {
  const speed = cfg.avgSpeedKmph > 0 ? cfg.avgSpeedKmph : 18;
  let t = nowMs;
  let pos = riderLoc;
  let totalTravelMin = 0;
  let totalKm = 0;
  const arrivalMs: number[] = [];
  const dropDeliveredMs = new Map<number, number>();
  for (const stop of seq) {
    const km = dist(pos, stop.loc);
    const travelMin = (km / speed) * 60;
    totalKm += km;
    totalTravelMin += travelMin;
    t += travelMin * 60_000;
    arrivalMs.push(t);
    if (stop.kind === "pickup") {
      if (stop.readyAtMs != null && t < stop.readyAtMs) t = stop.readyAtMs; // wait for ready
      t += cfg.pickupServiceMin * 60_000;
    } else {
      t += cfg.dropServiceMin * 60_000;
      dropDeliveredMs.set(stop.orderId, t);
    }
    pos = stop.loc;
  }
  return { totalTravelMin, totalKm, arrivalMs, dropDeliveredMs };
}

/** Every valid position pair to insert [pickup, drop] into `base` keeping base order & pickup<drop. */
function* insertionSequences(
  base: RouteStop[],
  pickup: RouteStop,
  drop: RouteStop
): Generator<RouteStop[]> {
  const n = base.length;
  for (let i = 0; i <= n; i++) {
    for (let j = i; j <= n; j++) {
      const seq: RouteStop[] = [];
      for (let k = 0; k <= n; k++) {
        if (k === i) seq.push(pickup);
        if (k === j) seq.push(drop);
        if (k < n) seq.push(base[k]!);
      }
      yield seq;
    }
  }
}

export function evaluateBatchInsertion(input: BatchRouteInput): BatchRouteResult {
  const dist = input.distanceKm ?? haversineKm;
  const cfg = input.config;
  const infeasible = (reason: BatchRouteReason): BatchRouteResult => ({
    feasible: false,
    reason,
    score: Number.POSITIVE_INFINITY,
    addedTravelMin: Number.POSITIVE_INFINITY,
    pickupDetourKm: Number.POSITIVE_INFINITY,
    maxExtraDropDelayMin: Number.POSITIVE_INFINITY,
    sequence: [],
  });

  // Baseline: solo route for the existing stops (no candidate). Used for detour / extra-delay deltas.
  const baseline = simulate(input.riderLoc, input.nowMs, input.existingStops, cfg, dist);

  let best: BatchRouteResult | null = null;
  let worstReason: BatchRouteReason = "ROUTE_INFEASIBLE";

  for (const seq of insertionSequences(input.existingStops, input.candidatePickup, input.candidateDrop)) {
    const sim = simulate(input.riderLoc, input.nowMs, seq, cfg, dist);

    // HARD: SLA — every drop (existing + new) with a deadline must be met.
    let slaOk = true;
    for (const stop of seq) {
      if (stop.kind !== "drop" || stop.deadlineMs == null) continue;
      const delivered = sim.dropDeliveredMs.get(stop.orderId);
      if (delivered != null && delivered > stop.deadlineMs) {
        slaOk = false;
        break;
      }
    }
    if (!slaOk) {
      worstReason = "SLA_RISK";
      continue;
    }

    // HARD: existing drops must not slip beyond the allowed extra delay vs their solo ETA.
    let maxExtraDelay = 0;
    let extraOk = true;
    for (const stop of input.existingStops) {
      if (stop.kind !== "drop") continue;
      const solo = baseline.dropDeliveredMs.get(stop.orderId);
      const batched = sim.dropDeliveredMs.get(stop.orderId);
      if (solo != null && batched != null) {
        const extraMin = (batched - solo) / 60_000;
        if (extraMin > maxExtraDelay) maxExtraDelay = extraMin;
        if (extraMin > cfg.maxExtraDropDelayMin) extraOk = false;
      }
    }
    if (!extraOk) {
      worstReason = "EXTRA_DROP_DELAY_TOO_LARGE";
      continue;
    }

    // HARD: pickup detour — extra travel this insertion adds vs the solo route (proxy for §18).
    const pickupDetourKm = Math.max(0, sim.totalKm - baseline.totalKm);
    const pickupDetourMin = Math.max(0, sim.totalTravelMin - baseline.totalTravelMin);
    if (pickupDetourKm > cfg.maxPickupDetourKm || pickupDetourMin > cfg.maxPickupDetourMin) {
      worstReason = "PICKUP_DETOUR_TOO_LARGE";
      continue;
    }

    // SOFT score: added travel time, minus a same-store bonus when the new pickup shares a store
    // with an existing pickup (§16). Lower is better.
    const sameStore =
      input.candidatePickup.storeKey != null &&
      input.existingStops.some(
        (s) => s.kind === "pickup" && s.storeKey != null && s.storeKey === input.candidatePickup.storeKey
      );
    const score = pickupDetourMin - (sameStore ? cfg.sameStoreBonus : 0);

    if (!best || score < best.score) {
      best = {
        feasible: true,
        reason: null,
        score: Math.round(score * 1000) / 1000,
        addedTravelMin: Math.round(pickupDetourMin * 100) / 100,
        pickupDetourKm: Math.round(pickupDetourKm * 100) / 100,
        maxExtraDropDelayMin: Math.round(maxExtraDelay * 100) / 100,
        sequence: seq.map((s) => ({ orderId: s.orderId, kind: s.kind })),
      };
    }
  }

  return best ?? infeasible(worstReason);
}
