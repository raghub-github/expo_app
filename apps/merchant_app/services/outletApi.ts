/**
 * Outlet (store) info and operating hours — backend CRUD.
 * Store timing table (merchant_store_operating_hours) and schedule engine are managed entirely
 * in the backend; this app only reads/updates via these APIs. Do not add schedule or open/close
 * logic in the app. All requests require Authorization: Bearer <token>. Store id = merchant_stores.id (numeric).
 */

import { getConfig, resolveUrlForDevice } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

let outletCache:
  | {
      storeId: number;
      token: string;
      data: OutletInfo;
    }
  | null = null;

let outletPromise:
  | {
      storeId: number;
      token: string;
      promise: Promise<OutletInfo>;
    }
  | null = null;

/** Resolve image URL: if relative, prepend API base; normalize localhost for Android so images load. */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (url == null || typeof url !== "string" || !url.trim()) return null;
  let u = url.trim();
  // Dashboard/partnersite persist `/api/attachments/proxy?key=...`; Fastify serves `/v1/attachments/proxy`.
  if (u.startsWith("/api/attachments/proxy")) {
    u = "/v1/attachments/proxy" + u.slice("/api/attachments/proxy".length);
  }
  let absolute: string;
  if (u.startsWith("http://") || u.startsWith("https://")) {
    absolute = u;
  } else {
    const base = getBase().replace(/\/+$/, "");
    absolute = base + (u.startsWith("/") ? u : `/${u}`);
  }
  return resolveUrlForDevice(absolute);
}

export type OutletInfo = {
  id: number;
  store_id: string;
  store_name: string;
  store_display_name: string | null;
  store_description: string | null;
  store_email: string | null;
  store_phones: string[];
  full_address: string;
  landmark: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  logo_url: string | null;
  /** Banner: from child store only (merchant_stores.banner_url). Each store has its own banner. */
  banner_url: string | null;
  /** Logo: from parent only (merchant_parents.store_logo). All child stores under same parent share this logo. Use this for UI; do not use store logo_url for display. */
  parent_logo_url?: string | null;
  cuisine_types: string[];
  food_categories: string[];
  /** From pickup_instructions table; only present when an active row exists for this store. */
  pickup_instruction?: string | null;
  min_order_amount?: number;
  delivery_radius_km?: number | null;
  avg_preparation_time_minutes?: number;
  is_pure_veg?: boolean;
  accepts_online_payment?: boolean;
  accepts_cash?: boolean;
};

export type OutletUpdateBody = Partial<{
  store_name: string;
  store_display_name: string | null;
  store_description: string | null;
  store_email: string | null;
  store_phones: string[];
  full_address: string;
  landmark: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  logo_url: string | null;
  banner_url: string | null;
  cuisine_types: string[];
  food_categories: string[];
  min_order_amount: number;
  delivery_radius_km: number | null;
  avg_preparation_time_minutes: number;
  is_pure_veg: boolean;
  accepts_online_payment: boolean;
  accepts_cash: boolean;
}>;

export type DaySlots = {
  open: boolean;
  slot1_start: string | null;
  slot1_end: string | null;
  slot2_start: string | null;
  slot2_end: string | null;
};

export type OperatingHours = {
  id: number;
  store_id: number;
  is_24_hours: boolean;
  same_for_all_days: boolean;
  closed_days: string[];
  monday: DaySlots;
  tuesday: DaySlots;
  wednesday: DaySlots;
  thursday: DaySlots;
  friday: DaySlots;
  saturday: DaySlots;
  sunday: DaySlots;
};

/** Overlapping GET operating-hours (header + Strict Mode) share one in-flight request per store. */
const operatingHoursInFlight = new Map<number, Promise<OperatingHours | null>>();

export async function getOutlet(
  storeId: number,
  token: string
): Promise<OutletInfo> {
  if (
    outletCache &&
    outletCache.storeId === storeId &&
    outletCache.token === token
  ) {
    return outletCache.data;
  }
  if (
    outletPromise &&
    outletPromise.storeId === storeId &&
    outletPromise.token === token
  ) {
    const data = await outletPromise.promise;
    outletCache = { storeId, token, data };
    return data;
  }
  const promise = (async () => {
    const res = await authFetch(
      `${getBase()}/v1/merchant-partner/stores/${storeId}`,
      token
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as any).error || res.statusText || "Failed to load outlet"
      );
    }
    const data: OutletInfo = await res.json();
    outletCache = { storeId, token, data };
    return data;
  })();
  outletPromise = { storeId, token, promise };
  promise.catch(() => {
    if (outletPromise?.storeId === storeId && outletPromise?.token === token) {
      outletPromise = null;
    }
  });
  return promise;
}

export function prefetchOutlet(storeId: number, token: string): void {
  if (
    outletCache &&
    outletCache.storeId === storeId &&
    outletCache.token === token
  ) {
    return;
  }
  if (
    outletPromise &&
    outletPromise.storeId === storeId &&
    outletPromise.token === token
  ) {
    return;
  }
  getOutlet(storeId, token).catch(() => {
    // Ignore 401 invalid_token / session errors so they don't become uncaught promise rejections.
  });
}

export async function updateOutlet(
  storeId: number,
  body: OutletUpdateBody,
  token: string
): Promise<void> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to update outlet");
  }
}

/** Set or clear pickup instruction for the store. Pass null or empty to clear. */
export async function updatePickupInstruction(
  storeId: number,
  instructionText: string | null,
  token: string
): Promise<void> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/pickup-instruction`, token, {
    method: "PUT",
    body: JSON.stringify({ instruction_text: instructionText ?? "" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to update pickup instruction");
  }
}

export async function getOperatingHours(storeId: number, token: string): Promise<OperatingHours | null> {
  const sid = typeof storeId === "number" && Number.isFinite(storeId) ? storeId : Number(storeId);
  if (!Number.isInteger(sid) || sid < 1) {
    return Promise.reject(new Error("Invalid store"));
  }
  const existing = operatingHoursInFlight.get(sid);
  if (existing) return existing;

  const p = (async (): Promise<OperatingHours | null> => {
    const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${sid}/operating-hours`, token);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || res.statusText || "Failed to load timings");
    }
    const data = await res.json();
    return data === null ? null : data;
  })().finally(() => {
    operatingHoursInFlight.delete(sid);
  });
  operatingHoursInFlight.set(sid, p);
  return p;
}

export async function updateOperatingHours(
  storeId: number,
  body: Partial<OperatingHours> & { days?: Record<string, DaySlots> },
  token: string
): Promise<void> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/operating-hours`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to update timings");
  }
}

/** Single audit log entry (store profile changes). */
export type AuditLogEntry = {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  action_field: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  performed_by: string;
  performed_by_id: number | null;
  performed_by_name: string | null;
  performed_by_email: string | null;
  audit_metadata?: Record<string, unknown> | null;
  created_at: string;
};

/** Fetch audit logs for a store (edited by, last changes at, old/new data). */
export async function getStoreAuditLogs(
  storeId: number,
  token: string,
  opts?: { limit?: number }
): Promise<AuditLogEntry[]> {
  const limit = Math.min(opts?.limit ?? 50, 200);
  const url = `${getBase()}/v1/merchant-partner/stores/${storeId}/audit-logs?limit=${limit}`;
  const res = await authFetch(url, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to load change history");
  }
  return res.json();
}
