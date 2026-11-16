import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";
import { getOrCreateMerchantDeviceId } from "@/lib/merchantDeviceId";
import { getCachedFoodOrdersForStore } from "@/lib/foodOrderCache";

const getBase = () => getConfig().apiBaseUrl.replace(/\/+$/, "");

export type ApiFoodOrderCustomizationLine = {
  name: string;
  amount: number;
  kind: "variant" | "addon" | "note";
};

export type ApiFoodOrderItem = {
  qty: number;
  name: string;
  price: number;
  menu_item_id?: number | string | null;
  /** Persisted on orders_core.items / orders_food.items JSON (same as menu_item_id PK). */
  item_id?: number | null;
  item_image_url?: string | null;
  veg_nonveg?: string | null;
  customizations?: string[];
  variant_tag?: string | null;
  category_name?: string | null;
  customization_lines?: ApiFoodOrderCustomizationLine[];
  base_amount?: number;
  customizations_total?: number;
  captured_base_amount?: number;
  captured_addon_amount?: number;
  has_customizations?: boolean;
  catalog_line_total?: number;
  net_line_total?: number;
  offer_discount?: number;
  offer_label?: string | null;
  is_item_promo?: boolean;
  applied_offer_type?: string | null;
  ctm_from_snapshot?: boolean;
  special_instructions?: string | null;
  specialInstructions?: string | null;
};

export type ApiFoodOrderPricing = {
  subtotal: number;
  packaging: number;
  taxes: number;
  discount: number;
  total: number;
};

export type ApiFoodOrder = {
  orders_food_id: number;
  orders_core_id: number;
  core_only?: boolean;
  formatted_order_id: string | null;
  /** Tax invoice number from orders_core (GST compliance). */
  tax_invoice_number?: string | null;
  order_status: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  drop_address: string | null;
  distance_km: number | null;
  customer_store_order_ordinal: number | null;
  customer_store_orders_total: number | null;
  customer_platform_orders_total: number | null;
  is_bulk_order?: boolean;
  veg_non_veg?: string | null;
  created_at: string;
  delivery_type: "GATIMITRA_RIDER" | "SELF_DELIVERY" | "SELF_PICKUP" | string;
  rider_id: number | null;
  rider_name?: string | null;
  rider_mobile?: string | null;
  rider_selfie_url?: string | null;
  rider_assignment_status?: string | null;
  rider_reached_at?: string | null;
  rider_display_variant?:
    | "on_the_way"
    | "arrived"
    | "picked_up"
    | "delivered"
    | "cancelled"
    | "rto"
    | null;
  core_status?: string | null;
  current_status?: string | null;
  reached_merchant_at?: string | null;
  rider_reached_pickup_at?: string | null;
  pickup_wait_seconds?: number | null;
  rider_store_wait_live?: boolean;
  rider_store_wait_anchor_at?: string | null;
  rider_free_wait_seconds?: number | null;
  rider_wait_priority?: boolean;
  grand_total: number;
  food_items_total_value?: number | null;
  /** Frozen merchant CTM from orders_core.total_ctm (payout / Partner Site SSOT). */
  total_ctm?: number | null;
  /** Frozen SSOT precision discount (orders_core.merchant_precision_discount) — pass-through, never recomputed. */
  merchant_precision_discount?: number | null;
  pricing?: ApiFoodOrderPricing | null;
  billing_snapshot?: Record<string, unknown> | null;
  payment_status?: string | null;
  items: ApiFoodOrderItem[];
  pickup_otp: string | null;
  /** Secure QR pickup token (order_pickup_tokens.token). */
  pickup_token?: string | null;
  /** Backend-generated store-scoped KOT number. */
  kot_number?: string | null;
  rto_otp: string | null;
  requires_utensils?: boolean | null;
  delivery_instructions?: string | null;
  merchant_instructions_list?: unknown;
  payment_method: string | null;
  accepted_at: string | null;
  preparing_at: string | null;
  prepared_at: string | null;
  dispatched_at: string | null;
  preparation_time_minutes?: number | null;
  prep_ready_by_at?: string | null;
  expected_ready_at?: string | null;
  prep_delay_minutes?: number | null;
  prep_delay_use_count?: number | null;
  last_prep_delay_minutes_added?: number | null;
  prepared_late_minutes?: number | null;
  handed_over_to_rider_at?: string | null;
  rider_picked_up_at?: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  rejected_reason: string | null;
  accepted_by_label: string | null;
  cancelled_by_label: string | null;
  cancelled_by_type?: string | null;
  cancellation_compensation?: import("@/lib/merchantCancellationCompensation").MerchantCancellationCompensationDisplay | null;
  is_scheduled_order?: boolean;
  scheduled_delivery_summary?: string | null;
  merchant_response_deadline_at?: string | null;
  merchant_response_timeout_seconds?: number | null;
  store_rating?: ApiStoreOrderRating | null;
};

export type ApiStoreOrderRating = {
  review_id: number;
  rating: number;
  review_text: string | null;
  review_title: string | null;
  created_at: string;
  reply_text: string | null;
  replied_at: string | null;
};

/**
 * Mint a Supabase-compatible realtime token scoped to the merchant's stores.
 * The app passes it to supabase.realtime.setAuth() so postgres_changes on
 * orders_core/orders_food are delivered under RLS.
 */
export async function fetchRealtimeAuthToken(
  token: string
): Promise<{ token: string; expiresIn: number; storeIds: number[] }> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/realtime-auth`, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "realtime_auth_failed");
  }
  const data = (await res.json()) as { token: string; expiresIn?: number; storeIds?: number[] };
  return {
    token: data.token,
    expiresIn: Number(data.expiresIn) || 3300,
    storeIds: Array.isArray(data.storeIds) ? data.storeIds : [],
  };
}

function isOrdersClientTimeout(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /timed out|timeout|aborted/i.test(msg);
}

/** After timeout, brief pause so we don't stampede — keep short so empty board recovers. */
const FOOD_ORDERS_COOLDOWN_MS = 3_000;
/**
 * Client timeout for the board list. Server live deadline is 8s; allow network slack
 * without pinning Android's ~6 sockets/host for 22s.
 */
const FOOD_ORDERS_TIMEOUT_MS = 14_000;

/**
 * Keep list-GET gates on globalThis — Hermes Fast Refresh can drop module-scope
 * `const` Maps while exported helpers still run ("Property doesn't exist").
 */
type FoodOrdersGate = {
  inFlight: Map<number, Promise<ApiFoodOrder[]>>;
  cooldownUntil: Map<number, number>;
};

function foodOrdersGate(): FoodOrdersGate {
  const g = globalThis as typeof globalThis & { __gmFoodOrdersGate?: FoodOrdersGate };
  let gate = g.__gmFoodOrdersGate;
  if (!gate || !(gate.cooldownUntil instanceof Map) || !(gate.inFlight instanceof Map)) {
    gate = {
      inFlight: new Map(),
      cooldownUntil: new Map(),
    };
    g.__gmFoodOrdersGate = gate;
  }
  return gate;
}

export function getFoodOrdersCooldownRemainingMs(storeId: number): number {
  try {
    const until = foodOrdersGate().cooldownUntil.get(storeId) ?? 0;
    return Math.max(0, until - Date.now());
  } catch {
    // Hermes Fast Refresh can leave a stale binding mid-reload; treat as no cooldown.
    return 0;
  }
}

export function clearFoodOrdersCooldown(storeId?: number): void {
  const gate = foodOrdersGate();
  if (storeId == null) {
    gate.cooldownUntil.clear();
    return;
  }
  gate.cooldownUntil.delete(storeId);
}

export async function fetchFoodOrders(
  storeId: number,
  token: string,
  opts?: { limit?: number; from?: string; to?: string; allowRetry?: boolean; force?: boolean }
): Promise<ApiFoodOrder[]> {
  const gate = foodOrdersGate();
  if (opts?.force) {
    gate.cooldownUntil.delete(storeId);
  }

  const cooldownLeft = getFoodOrdersCooldownRemainingMs(storeId);
  if (!opts?.force && cooldownLeft > 0) {
    // Prefer last good board over a hard error during cooldown (empty UI).
    const cached = getCachedFoodOrdersForStore(storeId);
    if (cached.length > 0) return cached;
    throw new Error("Request timed out. Pull to refresh and try again.");
  }

  const existing = gate.inFlight.get(storeId);
  if (existing && !opts?.force) {
    return existing;
  }

  const q = new URLSearchParams();
  if (opts?.limit) q.set("limit", String(opts.limit));
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  const qs = q.toString();
  const url = `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders${qs ? `?${qs}` : ""}`;

  const runOnce = async (): Promise<ApiFoodOrder[]> => {
    const res = await authFetch(url, token, { timeoutMs: FOOD_ORDERS_TIMEOUT_MS });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const code = (err as { error?: string }).error;
      if (code === "orders_load_timeout") {
        const timeoutErr = new Error("Orders took too long to load. Pull to refresh and try again.");
        (timeoutErr as Error & { code?: string }).code = "orders_load_timeout";
        throw timeoutErr;
      }
      throw new Error(code || "Failed to load orders");
    }
    const data = (await res.json()) as { orders?: ApiFoodOrder[] };
    return Array.isArray(data.orders) ? data.orders : [];
  };

  const run = (async (): Promise<ApiFoodOrder[]> => {
    try {
      const orders = await runOnce();
      foodOrdersGate().cooldownUntil.delete(storeId);
      return orders;
    } catch (e) {
      const timedOut =
        isOrdersClientTimeout(e) ||
        (e instanceof Error && (e as Error & { code?: string }).code === "orders_load_timeout");
      if (timedOut) {
        // One quick retry — first attempt often loses the socket race to boot polls.
        try {
          await new Promise((r) => setTimeout(r, 400));
          const orders = await runOnce();
          foodOrdersGate().cooldownUntil.delete(storeId);
          return orders;
        } catch (retryErr) {
          foodOrdersGate().cooldownUntil.set(storeId, Date.now() + FOOD_ORDERS_COOLDOWN_MS);
          const cached = getCachedFoodOrdersForStore(storeId);
          if (cached.length > 0) return cached;
          throw retryErr;
        }
      }
      throw e;
    } finally {
      const live = foodOrdersGate();
      if (live.inFlight.get(storeId) === run) {
        live.inFlight.delete(storeId);
      }
    }
  })();

  gate.inFlight.set(storeId, run);
  return run;
}

/** Cancel unaccepted orders past the acceptance window (portal-open flush). */
const syncAcceptanceInFlight = new Map<number, Promise<{ cancelled: number }>>();

export async function syncAcceptanceTimeout(
  storeId: number,
  token: string
): Promise<{ cancelled: number }> {
  const existing = syncAcceptanceInFlight.get(storeId);
  if (existing) return existing;

  const run = (async () => {
    const res = await authFetch(
      `${getBase()}/v1/merchant-partner/stores/${storeId}/sync-acceptance-timeout`,
      token,
      { method: "POST", timeoutMs: 12_000 }
    );
    const data = (await res.json().catch(() => ({}))) as { cancelled?: number; error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Failed to sync acceptance timeout");
    }
    return { cancelled: Number(data.cancelled ?? 0) };
  })();

  syncAcceptanceInFlight.set(storeId, run);
  try {
    return await run;
  } finally {
    if (syncAcceptanceInFlight.get(storeId) === run) {
      syncAcceptanceInFlight.delete(storeId);
    }
  }
}

export async function fetchFoodOrder(
  storeId: number,
  ordersFoodId: number,
  token: string
): Promise<ApiFoodOrder> {
  // Targeted realtime hydrate must stay short so it never pins the host pool.
  const HARD_TIMEOUT_MS = 12_000;
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}`,
    token,
    { timeoutMs: HARD_TIMEOUT_MS }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const code = (err as { error?: string }).error;
    if (code === "orders_load_timeout") {
      throw new Error("Order details took too long to load. Pull to refresh and try again.");
    }
    throw new Error(code || "Failed to load order");
  }
  const data = (await res.json()) as { order?: ApiFoodOrder };
  if (!data.order) throw new Error("Order not found");
  return data.order;
}

export type NearbyDispatchRiderSummary = {
  nearbyCount: number;
  radiusKm: number;
  assignSoonMessage: string;
};

export async function fetchNearbyDispatchRiders(
  storeId: number,
  ordersFoodId: number,
  token: string
): Promise<{ summary: NearbyDispatchRiderSummary | null; riderAssigned: boolean }> {
  const HARD_TIMEOUT_MS = 4_000;
  try {
    const res = await Promise.race([
      authFetch(
        `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/nearby-dispatch-riders`,
        token,
        { timeoutMs: HARD_TIMEOUT_MS }
      ),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("nearby_timeout")), HARD_TIMEOUT_MS);
      }),
    ]);
    if (!res.ok) {
      return { summary: null, riderAssigned: false };
    }
    const data = (await res.json()) as {
      ok?: boolean;
      summary?: NearbyDispatchRiderSummary | null;
      riderAssigned?: boolean;
    };
    return {
      summary: data.summary ?? null,
      riderAssigned: Boolean(data.riderAssigned),
    };
  } catch {
    return { summary: null, riderAssigned: false };
  }
}

export type FoodOrderRiderLogEntry = {
  rider_id: number;
  rider_name: string | null;
  rider_mobile: string | null;
  selfie_url: string | null;
  assignment_status: string;
  assigned_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  reached_merchant_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
};

export type FoodOrderTimelineEntry = {
  id: number;
  status: string;
  previous_status: string | null;
  status_message: string | null;
  actor_type: string | null;
  occurred_at: string;
  expected_by_at: string | null;
  metadata: Record<string, unknown> | null;
};

export async function fetchFoodOrderTimeline(
  storeId: number,
  ordersFoodId: number,
  token: string
): Promise<FoodOrderTimelineEntry[]> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/timeline`,
    token
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { timeline?: FoodOrderTimelineEntry[] };
  return Array.isArray(data.timeline) ? data.timeline : [];
}

export type MerchantOrderActionForTimeline = {
  to_status: string;
  action_source?: string | null;
  actor_label?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
};

export async function fetchFoodOrderActions(
  storeId: number,
  ordersFoodId: number,
  token: string
): Promise<MerchantOrderActionForTimeline[]> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/activity`,
    token
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { actions?: MerchantOrderActionForTimeline[] };
  return Array.isArray(data.actions) ? data.actions : [];
}

export async function fetchFoodOrderRidersLog(
  storeId: number,
  ordersFoodId: number,
  token: string
): Promise<FoodOrderRiderLogEntry[]> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/riders-log`,
    token
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { riders?: FoodOrderRiderLogEntry[] };
  const riders = Array.isArray(data.riders) ? data.riders : [];
  return riders.map((r) => ({
    ...r,
    assigned_at: coerceRiderTs(r.assigned_at),
    accepted_at: coerceRiderTs(r.accepted_at),
    rejected_at: coerceRiderTs(r.rejected_at),
    reached_merchant_at: coerceRiderTs(r.reached_merchant_at),
    picked_up_at: coerceRiderTs(r.picked_up_at),
    delivered_at: coerceRiderTs(r.delivered_at),
    cancelled_at: coerceRiderTs(r.cancelled_at),
  }));
}

function coerceRiderTs(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    // Normalize postgres-style timestamps for Hermes Date parsing.
    if (!t.includes("T") && /^\d{4}-\d{2}-\d{2}\s+/.test(t)) {
      return t.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    }
    return t;
  }
  try {
    const d = new Date(value as string | number | Date);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  } catch {
    return null;
  }
}

/**
 * A decision this store already made on another device, or a move the order can
 * no longer take. Carries the server's code so callers can retire the card
 * instead of inviting staff to tap again at something already settled.
 */
export class MerchantOrderDecisionError extends Error {
  readonly code: string;
  readonly actualStatus: string;
  constructor(message: string, code: string, actualStatus: string) {
    super(message);
    this.name = "MerchantOrderDecisionError";
    this.code = code;
    this.actualStatus = actualStatus;
  }
}

/** True when the order is settled, so there is nothing left for this device to do. */
export function isOrderAlreadyDecided(err: unknown): err is MerchantOrderDecisionError {
  return err instanceof MerchantOrderDecisionError && err.code === "order_already_decided";
}

export async function patchFoodOrderStatus(
  storeId: number,
  ordersFoodId: number,
  token: string,
  status: string,
  rejectedReason?: string,
  opts?: {
    action_source?: string;
    accept_mode?: "auto" | "manual";
    cancel_mode?: "auto" | "manual";
    preparation_time_minutes?: number;
  }
): Promise<ApiFoodOrder> {
  const st = status.toUpperCase();
  // One order is live on every device signed into this store, so the server
  // needs to know which of them decided it. Audit only — authorisation still
  // comes from the token. A device id that cannot be read is simply omitted.
  const deviceId = await getOrCreateMerchantDeviceId().catch(() => "");
  const body = JSON.stringify({
    status,
    action_source: opts?.action_source ?? "app",
    ...(st === "ACCEPTED"
      ? {
          accept_mode: opts?.accept_mode ?? "manual",
          ...(opts?.preparation_time_minutes != null
            ? { preparation_time_minutes: opts.preparation_time_minutes }
            : {}),
        }
      : {}),
    ...(st === "CANCELLED" ? { cancel_mode: opts?.cancel_mode ?? "manual" } : {}),
    ...(rejectedReason ? { rejected_reason: rejectedReason } : {}),
  });

  // Retry timeouts: Android's ~6 connections/host can starve the PATCH while
  // food-orders list polls hang. Never report ready until a response (or
  // reconcile) confirms the DB row moved.
  const maxAttempts = 3;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await authFetch(
        `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}`,
        token,
        {
          method: "PATCH",
          timeoutMs: 25_000,
          headers: {
            "Content-Type": "application/json",
            ...(deviceId ? { "x-gm-device-id": deviceId } : {}),
          },
          body,
        }
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          actualStatus?: string;
        };
        const message = err.error || "Failed to update order";
        if (err.code) {
          throw new MerchantOrderDecisionError(message, err.code, err.actualStatus ?? "");
        }
        throw new Error(message);
      }
      const data = (await res.json()) as { order?: ApiFoodOrder };
      if (!data.order) throw new Error("Order update failed");
      return data.order;
    } catch (e) {
      lastErr = e;
      if (e instanceof MerchantOrderDecisionError) throw e;
      if (!isOrdersClientTimeout(e) || attempt >= maxAttempts) throw e;
      await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Failed to update order");
}

export async function postFoodOrderPrepDelay(
  storeId: number,
  ordersFoodId: number,
  token: string,
  additionalMinutes: number
): Promise<ApiFoodOrder> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/prep-delay`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ additional_minutes: additionalMinutes }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to extend preparation time");
  }
  const data = (await res.json()) as { order?: ApiFoodOrder };
  if (!data.order) throw new Error("Prep delay update failed");
  return data.order;
}

/** Self-pickup: verify customer Pickup OTP → mark order completed (Delivered). */
export async function postCompleteSelfPickup(
  storeId: number,
  ordersFoodId: number,
  token: string,
  otp: string
): Promise<ApiFoodOrder> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/complete-self-pickup`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp: otp.trim() }),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    order?: ApiFoodOrder;
    error?: string;
    valid?: boolean;
    completed?: boolean;
  };
  if (!res.ok || !data.completed || !data.order) {
    throw new Error(data.error || "Invalid OTP or could not complete pickup");
  }
  return data.order;
}
