import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export type ScheduledClosure = {
  from: string;
  to: string;
  reason: string;
};

export type StoreStatus = {
  store_id: number;
  is_open: boolean;
  is_accepting_orders: boolean;
  is_available: boolean;
  auto_open_from_schedule: boolean;
  block_auto_open: boolean;
  manual_close_until: string | null;
  restriction_type: string | null;
  scheduled_closure: ScheduledClosure | null;
  scheduled_closure_upcoming?: ScheduledClosure | null;
};

export async function getStoreStatus(
  storeId: number,
  token: string
): Promise<StoreStatus> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/status`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to load store status");
  }
  const data = (await res.json()) as Record<string, unknown>;
  const rawManual = data?.manual_close_until;
  let manualCloseUntil: string | null = null;
  if (typeof rawManual === "string" && rawManual.length > 0) {
    manualCloseUntil = rawManual;
  } else if (typeof rawManual === "number" && Number.isFinite(rawManual)) {
    const d = new Date(rawManual);
    manualCloseUntil = Number.isNaN(d.getTime()) ? null : d.toISOString();
  } else if (rawManual != null && typeof (rawManual as Date).getTime === "function") {
    manualCloseUntil = (rawManual as Date).toISOString();
  }
  const rawRestriction = data?.restriction_type;
  const restrictionType =
    typeof rawRestriction === "string" && rawRestriction.length > 0
      ? rawRestriction
      : rawRestriction != null
        ? String(rawRestriction)
        : null;

  const rawClosure = data?.scheduled_closure;
  let scheduledClosure: ScheduledClosure | null = null;
  if (rawClosure != null && typeof rawClosure === "object" && !Array.isArray(rawClosure)) {
    const r = rawClosure as Record<string, unknown>;
    const from = r.from != null ? String(r.from) : "";
    const to = r.to != null ? String(r.to) : "";
    const reason = r.reason != null ? String(r.reason) : "Scheduled off";
    if (from !== "" || to !== "" || reason !== "") {
      scheduledClosure = { from: from || to || "scheduled date", to: to || from || "scheduled date", reason };
    }
  }

  return {
    store_id: Number(data.store_id ?? storeId),
    is_open: data.is_open === true,
    is_accepting_orders: data.is_accepting_orders === true,
    is_available: data.is_available !== false,
    auto_open_from_schedule: data.auto_open_from_schedule !== false,
    block_auto_open: data.block_auto_open === true,
    manual_close_until: manualCloseUntil,
    restriction_type: restrictionType,
    scheduled_closure: scheduledClosure,
    scheduled_closure_upcoming: (data as any).scheduled_closure_upcoming ?? null,
  };
}

export async function updateStoreStatus(
  storeId: number,
  isOpen: boolean,
  token: string
): Promise<StoreStatus> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/status`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ is_open: isOpen }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to update store status");
  }
  const data = (await res.json()) as Record<string, unknown>;
  const rawManual = data?.manual_close_until;
  const manualCloseUntil =
    typeof rawManual === "string" && rawManual.length > 0
      ? rawManual
      : rawManual != null && typeof (rawManual as Date).getTime === "function"
        ? (rawManual as Date).toISOString()
        : null;
  const rawRestriction = data?.restriction_type;
  const restrictionType =
    typeof rawRestriction === "string" && rawRestriction.length > 0
      ? rawRestriction
      : rawRestriction != null
        ? String(rawRestriction)
        : null;

  return {
    store_id: Number(data.store_id ?? storeId),
    is_open: data.is_open === true,
    is_accepting_orders: data.is_accepting_orders === true,
    is_available: data.is_available !== false,
    auto_open_from_schedule: data.auto_open_from_schedule !== false,
    block_auto_open: data.block_auto_open === true,
    manual_close_until: manualCloseUntil,
    restriction_type: restrictionType,
    scheduled_closure: null,
  };
}

export async function updateAutoOpenFromSchedule(
  storeId: number,
  autoOpen: boolean,
  token: string
): Promise<StoreStatus> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/status`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ auto_open_from_schedule: autoOpen }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to update auto-open setting");
  }
  const data = (await res.json()) as Record<string, unknown>;
  const rawManual = data?.manual_close_until;
  const manualCloseUntil =
    typeof rawManual === "string" && rawManual.length > 0
      ? rawManual
      : rawManual != null && typeof (rawManual as Date).getTime === "function"
        ? (rawManual as Date).toISOString()
        : null;
  const rawRestriction = data?.restriction_type;
  const restrictionType =
    typeof rawRestriction === "string" && rawRestriction.length > 0
      ? rawRestriction
      : rawRestriction != null
        ? String(rawRestriction)
        : null;

  return {
    store_id: Number(data.store_id ?? storeId),
    is_open: data.is_open === true,
    is_accepting_orders: data.is_accepting_orders === true,
    is_available: data.is_available !== false,
    auto_open_from_schedule: data.auto_open_from_schedule !== false,
    block_auto_open: data.block_auto_open === true,
    manual_close_until: manualCloseUntil,
    restriction_type: restrictionType,
    scheduled_closure: null,
  };
}

export async function updateManualActivationLock(
  storeId: number,
  locked: boolean,
  token: string
): Promise<StoreStatus> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/status`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ block_auto_open: locked }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to update manual activation lock");
  }
  const data = (await res.json()) as Record<string, unknown>;
  const rawManual = data?.manual_close_until;
  const manualCloseUntil =
    typeof rawManual === "string" && rawManual.length > 0
      ? rawManual
      : rawManual != null && typeof (rawManual as Date).getTime === "function"
        ? (rawManual as Date).toISOString()
        : null;
  const rawRestriction = data?.restriction_type;
  const restrictionType =
    typeof rawRestriction === "string" && rawRestriction.length > 0
      ? rawRestriction
      : rawRestriction != null
        ? String(rawRestriction)
        : null;

  return {
    store_id: Number(data.store_id ?? storeId),
    is_open: data.is_open === true,
    is_accepting_orders: data.is_accepting_orders === true,
    is_available: data.is_available !== false,
    auto_open_from_schedule: data.auto_open_from_schedule !== false,
    block_auto_open: data.block_auto_open === true,
    manual_close_until: manualCloseUntil,
    restriction_type: restrictionType,
    scheduled_closure: null,
  };
}

