/**
 * Batch dispatch — LIVE INTEGRATION (flag-gated, fail-open). Called from the assignment engine's
 * per-candidate check, AFTER the existing capacity/eligibility gate passes. Its only job is to add
 * the batching-specific guards the legacy path lacks — for a rider who already has active orders:
 *   - operational-state: no additional order once anything is picked_up/in_transit (§37–39), and
 *   - route feasibility: the new pickup/drop must insert into the rider's route within the detour
 *     caps and WITHOUT making any delivery late (SLA always wins, §98).
 *
 * SAFETY: this can only ever REMOVE a candidate when it is CONFIDENT the batch is bad. It returns
 * allow=true (no change) when: batching is disabled for the service, the rider is idle (first order),
 * the service is person_ride, coordinates are missing, or ANY error occurs. So with the flag off
 * (the current state) it is a complete no-op, and it can never block a first-order assignment.
 */
import { evaluateBatchInsertion, type RouteStop, type LatLng } from "./batch-route.js";
import { riderStatePermitsBatching, operationalState, type OrderStatus } from "./operational-state.js";
import { loadBatchConfig, type ServiceBatchConfig } from "./batch-config.js";
import { getSql } from "../../db/client.js";
import type { DispatchServiceType } from "../order-assignment-engine.js";

/** Conservative SLA windows (minutes) used to derive a drop deadline from order creation time,
 *  since there is no stored promised-delivery timestamp. Deliberately generous — SLA-always-wins
 *  only rejects batches that clearly blow past these. */
const SLA_WINDOW_MIN: Record<string, number> = { food: 45, parcel: 90, person_ride: 30 };

export type ActiveOrderStops = {
  orderId: number;
  status: OrderStatus;
  pickup: LatLng;
  drop: LatLng;
  createdAtMs: number;
  storeKey: string | null;
};

export type BatchGateInput = {
  serviceType: DispatchServiceType;
  candidateOrderId: number;
  candidatePickup: LatLng;
  candidateDrop: LatLng;
  candidateCreatedAtMs: number;
  candidateStoreKey: string | null;
  riderLoc: LatLng;
  activeOrders: ActiveOrderStops[];
  config: ServiceBatchConfig;
  nowMs: number;
};

export type BatchGateResult = { allow: boolean; reason: string | null; offered: boolean };

function deadlineMs(createdAtMs: number, service: string): number {
  return createdAtMs + (SLA_WINDOW_MIN[service] ?? 45) * 60_000;
}
function toStops(o: ActiveOrderStops, service: string): RouteStop[] {
  return [
    { orderId: o.orderId, kind: "pickup", loc: o.pickup, storeKey: o.storeKey ?? undefined },
    { orderId: o.orderId, kind: "drop", loc: o.drop, deadlineMs: deadlineMs(o.createdAtMs, service) },
  ];
}

/** PURE decision (unit-tested). Given the resolved data, may the additional order be batched here? */
export function decideBatchGate(input: BatchGateInput): BatchGateResult {
  if (input.activeOrders.length === 0) return { allow: true, reason: null, offered: false }; // first order
  // Operational-state gate (§37–39): every active order must still be pre-pickup.
  if (!riderStatePermitsBatching(input.activeOrders.map((o) => o.status))) {
    return { allow: false, reason: "RIDER_IN_PICKUP_TO_DROP_STATE", offered: false };
  }
  const existingStops = input.activeOrders
    .filter((o) => operationalState(o.status) !== "TERMINAL")
    .flatMap((o) => toStops(o, input.serviceType));

  const route = evaluateBatchInsertion({
    riderLoc: input.riderLoc,
    nowMs: input.nowMs,
    existingStops,
    candidatePickup: {
      orderId: input.candidateOrderId,
      kind: "pickup",
      loc: input.candidatePickup,
      storeKey: input.candidateStoreKey ?? undefined,
    },
    candidateDrop: {
      orderId: input.candidateOrderId,
      kind: "drop",
      loc: input.candidateDrop,
      deadlineMs: deadlineMs(input.candidateCreatedAtMs, input.serviceType),
    },
    config: input.config,
  });
  if (!route.feasible) return { allow: false, reason: route.reason ?? "ROUTE_INFEASIBLE", offered: false };
  return { allow: true, reason: null, offered: true };
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

async function loadOrderStops(orderCoreId: number): Promise<ActiveOrderStops | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, status::text AS status, pickup_lat::float8 AS plat, pickup_lon::float8 AS plng,
           drop_lat::float8 AS dlat, drop_lon::float8 AS dlng, created_at, merchant_store_id
    FROM orders_core WHERE id = ${orderCoreId} LIMIT 1
  `) as unknown as Array<Record<string, unknown>>;
  const r = rows[0];
  if (!r) return null;
  const plat = num(r.plat), plng = num(r.plng), dlat = num(r.dlat), dlng = num(r.dlng);
  if (![plat, plng, dlat, dlng].every(Number.isFinite)) return null;
  return {
    orderId: Number(r.id),
    status: String(r.status ?? "assigned"),
    pickup: { lat: plat, lng: plng },
    drop: { lat: dlat, lng: dlng },
    createdAtMs: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now(),
    storeKey: r.merchant_store_id == null ? null : String(r.merchant_store_id),
  };
}

async function loadRiderActiveOrders(
  riderId: number,
  service: DispatchServiceType
): Promise<ActiveOrderStops[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, status::text AS status, pickup_lat::float8 AS plat, pickup_lon::float8 AS plng,
           drop_lat::float8 AS dlat, drop_lon::float8 AS dlng, created_at, merchant_store_id
    FROM orders_core
    WHERE rider_id = ${riderId} AND order_type = ${service}
      AND status::text NOT IN ('delivered','cancelled','failed')
  `) as unknown as Array<Record<string, unknown>>;
  const out: ActiveOrderStops[] = [];
  for (const r of rows) {
    const plat = num(r.plat), plng = num(r.plng), dlat = num(r.dlat), dlng = num(r.dlng);
    if (![plat, plng, dlat, dlng].every(Number.isFinite)) continue;
    out.push({
      orderId: Number(r.id),
      status: String(r.status ?? "assigned"),
      pickup: { lat: plat, lng: plng },
      drop: { lat: dlat, lng: dlng },
      createdAtMs: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now(),
      storeKey: r.merchant_store_id == null ? null : String(r.merchant_store_id),
    });
  }
  return out;
}

async function logDecision(
  orderCoreId: number,
  riderId: number,
  service: string,
  result: BatchGateResult,
  activeCount: number
): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO dispatch_batch_decision_log
        (order_core_id, candidate_rider_id, service_type, decision, rejection_reason, active_order_count, detail)
      VALUES (${orderCoreId}, ${riderId}, ${service},
        ${result.allow ? (result.offered ? "offered" : "passthrough") : "rejected"},
        ${result.reason}, ${activeCount}, ${JSON.stringify({ offered: result.offered })}::text::jsonb)
    `;
  } catch {
    /* never break dispatch on a logging failure */
  }
}

/**
 * Flag-gated, fail-open batch feasibility gate for one (order, rider) candidate. Returns allow=true
 * (no change) whenever batching is off, the rider is idle, or data is missing/erroring.
 */
export async function enforceBatchFeasibilityForCandidate(input: {
  riderId: number;
  serviceType: DispatchServiceType;
  orderCoreId: number;
  riderLat: number | null | undefined;
  riderLng: number | null | undefined;
}): Promise<{ allow: boolean; reason: string | null }> {
  try {
    // Person ride is never batched — but never interfere with its normal single-order dispatch here.
    if (input.serviceType === "person_ride") return { allow: true, reason: null };
    const config = (await loadBatchConfig()).get(input.serviceType);
    if (!config || !config.enabled) return { allow: true, reason: null }; // flag OFF → no-op
    const rlat = num(input.riderLat), rlng = num(input.riderLng);
    if (!Number.isFinite(rlat) || !Number.isFinite(rlng)) return { allow: true, reason: null };

    const activeOrders = await loadRiderActiveOrders(input.riderId, input.serviceType);
    if (activeOrders.length === 0) return { allow: true, reason: null }; // first order → unchanged

    const cand = await loadOrderStops(input.orderCoreId);
    if (!cand) return { allow: true, reason: null }; // can't resolve candidate → fail-open

    const result = decideBatchGate({
      serviceType: input.serviceType,
      candidateOrderId: input.orderCoreId,
      candidatePickup: cand.pickup,
      candidateDrop: cand.drop,
      candidateCreatedAtMs: cand.createdAtMs,
      candidateStoreKey: cand.storeKey,
      riderLoc: { lat: rlat, lng: rlng },
      activeOrders,
      config,
      nowMs: Date.now(),
    });
    void logDecision(input.orderCoreId, input.riderId, input.serviceType, result, activeOrders.length);
    return { allow: result.allow, reason: result.reason };
  } catch {
    return { allow: true, reason: null }; // fail-open — batching must never break dispatch
  }
}

/**
 * Authoritative accept-time batch check (§37–39/§94). Enforced when a BUSY rider accepts an
 * additional food/parcel order — closes the window where an order was offered while the rider was
 * pre-pickup but the rider then picked up their first order (offer surfaces are gated, but the offer
 * can outlive the state change). Throws 409 when the additional order can't be safely batched.
 * FULLY fail-open: any error or missing data → returns (allow) so a normal accept never breaks.
 */
export async function assertBatchFeasibleAtAccept(
  riderId: number,
  serviceType: DispatchServiceType,
  orderCoreId: number
): Promise<void> {
  try {
    if (serviceType === "person_ride") return;
    const config = (await loadBatchConfig()).get(serviceType);
    if (!config || !config.enabled) return; // flag off → no-op
    const { riderHasActiveDispatchOrder, loadRiderGpsLastKnown } = await import(
      "../order-assignment-engine.js"
    );
    if (!(await riderHasActiveDispatchOrder(riderId))) return; // idle → first order, no batch check
    const gps = await loadRiderGpsLastKnown(riderId).catch(() => null);
    const gate = await enforceBatchFeasibilityForCandidate({
      riderId,
      serviceType,
      orderCoreId,
      riderLat: gps?.lat ?? null,
      riderLng: gps?.lng ?? null,
    });
    if (!gate.allow) {
      const message =
        gate.reason === "RIDER_IN_PICKUP_TO_DROP_STATE"
          ? "Finish delivering your current order before accepting another."
          : "This order can't be added to your current delivery right now.";
      throw Object.assign(new Error(message), {
        statusCode: 409,
        code: "batch_infeasible",
        reason: gate.reason,
      });
    }
  } catch (e) {
    // Re-throw only our intentional 409; swallow everything else (fail-open).
    if ((e as { code?: string })?.code === "batch_infeasible") throw e;
  }
}
