/**
 * ETA timeline — map immutable order_eta_history rows → shared UI entries.
 * Backend is SoT; clients only render these labels (no local ETA math).
 */

import type { CustomerEtaView } from "./eta.customer-view.js";
import type { StageAwareEta } from "./eta.stage-aware.js";

export type EtaTimelineAudience = "customer" | "admin";

export type EtaAuditSnapshot = {
  stageAware?: StageAwareEta | null;
  customer?: CustomerEtaView | null;
  orderStatus?: string | null;
  displayEta?: number | null;
  totalEta?: number | null;
};

export type EtaTimelineEntry = {
  /** History row id — also the etaVersion for this revision. */
  id: number;
  etaVersion: number;
  at: string;
  reason: string;
  /** Human-readable timeline title. */
  label: string;
  /** Optional why-it-changed line for customers. */
  detail: string | null;
  orderStatus: string | null;
  stage: string | null;
  merchantPrepEta: number | null;
  riderToMerchantEta: number | null;
  pickupEta: number | null;
  customerDeliveryEta: number | null;
  displayEta: number | null;
  totalEta: number | null;
  oldEtaMinutes: number | null;
  newEtaMinutes: number | null;
  deltaMinutes: number | null;
  confidence: string | null;
  freezeCountdown: boolean;
  etaSource: string | null;
  contextLabel: string | null;
  merchantDelayed: boolean;
  promisedDeliveryAt: string | null;
  newPromisedDeliveryAt: string | null;
  /** Admin-only extras (omitted for customer audience). */
  riderId?: number | null;
  merchantStoreId?: number | null;
  previous?: EtaAuditSnapshot | null;
  next?: EtaAuditSnapshot | null;
  breakdown?: {
    prep: number | null;
    riderAssignment: number | null;
    riderToStore: number | null;
    storeToCustomer: number | null;
    traffic: number | null;
    weather: number | null;
    buffer: number | null;
  };
};

const CUSTOMER_LABELS: Record<string, string> = {
  ORDER_PLACED: "Order placed",
  RIDER_ASSIGNED: "Rider assigned",
  RIDER_PICKED_UP: "Order picked up",
  TRAFFIC_UPDATE: "Traffic update",
  WEATHER_UPDATE: "Weather update",
  MERCHANT_DELAY: "Preparation updated",
  BATCHING_CHANGE: "Delivery update",
  MANUAL_OVERRIDE: "Estimate updated",
  STATUS_CHANGE: "Status update",
  LIVE_TICK: "Live estimate update",
  INITIAL_ESTIMATE: "Initial estimate",
};

const STAGE_LABELS: Record<string, string> = {
  MERCHANT_ACCEPTED: "Merchant accepted",
  MERCHANT_PREP: "Merchant preparing",
  READY_AWAITING_RIDER: "Ready — waiting for rider",
  RIDER_TO_MERCHANT: "Rider arriving at restaurant",
  AT_STORE: "Rider at restaurant",
  CUSTOMER_DELIVERY: "On the way",
  ARRIVING: "Nearby",
  DELIVERED: "Delivered",
};

export function customerLabelForReason(reason: string, stage?: string | null): string {
  const stageLabel = stage ? STAGE_LABELS[stage] : null;
  if (reason === "ORDER_PLACED") return CUSTOMER_LABELS.ORDER_PLACED;
  if (reason === "RIDER_PICKED_UP") return CUSTOMER_LABELS.RIDER_PICKED_UP;
  if (reason === "RIDER_ASSIGNED") return CUSTOMER_LABELS.RIDER_ASSIGNED;
  if (reason === "MERCHANT_DELAY") return CUSTOMER_LABELS.MERCHANT_DELAY;
  if (stageLabel && (reason === "STATUS_CHANGE" || reason === "LIVE_TICK")) {
    return stageLabel;
  }
  return CUSTOMER_LABELS[reason] ?? "Estimate updated";
}

export function customerDetailForEntry(args: {
  reason: string;
  stage: string | null;
  displayEta: number | null;
  deltaMinutes: number | null;
  merchantDelayed: boolean;
  contextLabel: string | null;
  oldEtaMinutes?: number | null;
}): string | null {
  const parts: string[] = [];
  if (args.merchantDelayed && args.reason === "MERCHANT_DELAY") {
    parts.push("Restaurant needs a bit more prep time");
  } else if (args.contextLabel) {
    parts.push(args.contextLabel);
  }

  const oldM = args.oldEtaMinutes;
  const newM = args.displayEta;
  if (
    oldM != null &&
    newM != null &&
    Number.isFinite(oldM) &&
    Number.isFinite(newM) &&
    Math.round(oldM) !== Math.round(newM)
  ) {
    const o = Math.round(oldM);
    const n = Math.round(newM);
    if (n < o) parts.push(`ETA improved from ${o} min to ${n} min`);
    else parts.push(`ETA updated from ${o} min to ${n} min`);
  } else if (newM != null && Number.isFinite(newM)) {
    parts.push(
      newM <= 0 ? "Arriving now" : `About ${Math.round(newM)} min remaining`
    );
  }

  if (args.reason === "LIVE_TICK" || args.reason === "STATUS_CHANGE") {
    if (!parts.some((p) => p.includes("ETA"))) {
      parts.push("Updated automatically based on live progress");
    }
  }

  return parts.length > 0 ? parts.join(". ") : null;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asStageAware(v: unknown): StageAwareEta | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.currentStage !== "string") return null;
  return v as StageAwareEta;
}

function asCustomer(v: unknown): CustomerEtaView | null {
  if (!v || typeof v !== "object") return null;
  return v as CustomerEtaView;
}

export type RawEtaHistoryRow = {
  id: number | string;
  old_eta_min?: number | null;
  old_eta_max?: number | null;
  new_eta_min?: number | null;
  new_eta_max?: number | null;
  promised_delivery_at?: string | null;
  new_promised_delivery_at?: string | null;
  recalc_reason: string;
  prep_minutes?: number | null;
  rider_assignment_minutes?: number | null;
  rider_to_store_minutes?: number | null;
  store_to_customer_minutes?: number | null;
  traffic_delay_minutes?: number | null;
  weather_delay_minutes?: number | null;
  congestion_delay_minutes?: number | null;
  buffer_minutes?: number | null;
  rider_id?: number | null;
  merchant_store_id?: number | null;
  metadata?: unknown;
  created_at: string;
  order_status?: string | null;
  current_stage?: string | null;
  display_eta_minutes?: number | null;
  total_eta_minutes?: number | null;
  confidence?: string | null;
  freeze_countdown?: boolean | null;
  eta_source?: string | null;
  delta_minutes?: number | null;
  previous_snapshot?: unknown;
  new_snapshot?: unknown;
};

export function mapHistoryRowToTimelineEntry(
  row: RawEtaHistoryRow,
  audience: EtaTimelineAudience
): EtaTimelineEntry {
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const stageAware =
    asStageAware(row.new_snapshot) ??
    asStageAware(meta.stageAware) ??
    asStageAware(
      meta.new && typeof meta.new === "object"
        ? (meta.new as Record<string, unknown>).stageAware
        : null
    );
  const prevAware =
    asStageAware(row.previous_snapshot) ??
    asStageAware(
      meta.previous && typeof meta.previous === "object"
        ? (meta.previous as Record<string, unknown>).stageAware
        : null
    ) ??
    asStageAware(meta.previousStageAware);
  const customer =
    asCustomer(meta.customer) ??
    asCustomer((meta.new as Record<string, unknown> | undefined)?.customer);

  const stage =
    row.current_stage ??
    stageAware?.currentStage ??
    null;
  const displayEta =
    numOrNull(row.display_eta_minutes) ??
    numOrNull(stageAware?.displayEta) ??
    numOrNull(customer?.etaMinutes) ??
    numOrNull(row.new_eta_max);
  const totalEta =
    numOrNull(row.total_eta_minutes) ??
    numOrNull(stageAware?.totalEta) ??
    numOrNull(row.new_eta_max);
  const oldEta =
    numOrNull(prevAware?.displayEta) ??
    numOrNull(prevAware?.totalEta) ??
    // Prefer prior display from metadata customer snapshot over immutable promise max
    // (promise old_eta_max makes every row look like "70 → X").
    numOrNull(
      meta.previous && typeof meta.previous === "object"
        ? (meta.previous as Record<string, unknown>).displayEta
        : null
    );
  const newEta = displayEta ?? numOrNull(row.new_eta_max);
  const delta =
    numOrNull(row.delta_minutes) ??
    (oldEta != null && newEta != null ? Math.round(newEta - oldEta) : null);

  const reason = String(row.recalc_reason ?? "STATUS_CHANGE");
  const merchantDelayed = Boolean(customer?.merchantDelayed ?? meta.merchantDelayed);
  const contextLabel = customer?.contextLabel ?? null;
  const confidence =
    row.confidence ?? stageAware?.confidence ?? null;
  const freezeCountdown = Boolean(
    row.freeze_countdown ?? stageAware?.freezeCountdown ?? false
  );
  const etaSource =
    row.eta_source ?? stageAware?.etaSource ?? reason;
  const id = Number(row.id);

  const entry: EtaTimelineEntry = {
    id,
    etaVersion: id,
    at: String(row.created_at),
    reason,
    label: customerLabelForReason(reason, stage),
    detail: customerDetailForEntry({
      reason,
      stage,
      displayEta,
      deltaMinutes: delta,
      merchantDelayed,
      contextLabel,
      oldEtaMinutes: oldEta,
    }),
    orderStatus: row.order_status ?? (meta.orderStatus as string | null) ?? null,
    stage,
    merchantPrepEta: numOrNull(stageAware?.merchantPrepEta),
    riderToMerchantEta: numOrNull(stageAware?.riderToMerchantEta),
    pickupEta: numOrNull(stageAware?.pickupEta),
    customerDeliveryEta: numOrNull(stageAware?.customerDeliveryEta),
    displayEta,
    totalEta,
    oldEtaMinutes: oldEta,
    newEtaMinutes: newEta,
    deltaMinutes: delta,
    confidence,
    freezeCountdown,
    etaSource,
    contextLabel,
    merchantDelayed,
    promisedDeliveryAt: row.promised_delivery_at ?? null,
    newPromisedDeliveryAt: row.new_promised_delivery_at ?? null,
  };

  if (audience === "admin") {
    entry.riderId = row.rider_id ?? null;
    entry.merchantStoreId = row.merchant_store_id ?? null;
    entry.previous = {
      stageAware: prevAware,
      displayEta: numOrNull(prevAware?.displayEta),
      totalEta: numOrNull(prevAware?.totalEta),
      orderStatus: (meta.previousOrderStatus as string | null) ?? null,
    };
    entry.next = {
      stageAware,
      customer,
      displayEta,
      totalEta,
      orderStatus: entry.orderStatus,
    };
    entry.breakdown = {
      prep: numOrNull(row.prep_minutes),
      riderAssignment: numOrNull(row.rider_assignment_minutes),
      riderToStore: numOrNull(row.rider_to_store_minutes),
      storeToCustomer: numOrNull(row.store_to_customer_minutes),
      traffic: numOrNull(row.traffic_delay_minutes),
      weather: numOrNull(row.weather_delay_minutes),
      buffer: numOrNull(row.buffer_minutes),
    };
  }

  return entry;
}

export function mapHistoryRowsToTimeline(
  rows: RawEtaHistoryRow[],
  audience: EtaTimelineAudience,
  order: "asc" | "desc" = "asc"
): EtaTimelineEntry[] {
  const mapped = rows.map((r) => mapHistoryRowToTimelineEntry(r, audience));
  mapped.sort((a, b) =>
    order === "asc" ? a.id - b.id : b.id - a.id
  );
  return mapped;
}
