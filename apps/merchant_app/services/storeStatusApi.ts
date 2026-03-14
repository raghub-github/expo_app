import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

function getBase(): string {
  try {
    const config = getConfig();
    const url = config?.apiBaseUrl;
    if (typeof url === "string" && url.trim()) return url.trim().replace(/\/+$/, "");
  } catch {
    // ignore
  }
  return "http://localhost:3000";
}

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
  manual_close_reason: string | null;
  manual_close_start_at: string | null;
  closed_by: string | null;
  closed_by_id: string | null;
  restriction_type: string | null;
  scheduled_closure: ScheduledClosure | null;
  scheduled_closure_upcoming?: ScheduledClosure | null;
  status_reason?: string | null;
  unavailable_reason?: string | null;
  next_open_time?: string | null;
  next_close_time?: string | null;
  next_open_iso?: string | null;
};

export type WeeklyDay = {
  date: string;
  label: string;
  orders_count: number;
};

export type StatusHistoryEntry = {
  id: number;
  action: string;
  restriction_type: string | null;
  performed_by: string | null;
  reason: string | null;
  at: string;
};

export async function getStoreStatusHistory(
  storeId: number,
  token: string,
  limit?: number
): Promise<{ history: StatusHistoryEntry[] }> {
  const qs = limit != null ? `?limit=${Math.min(limit, 50)}` : "";
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/status/history${qs}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to load status history");
  }
  const data = (await res.json()) as { history?: Array<Record<string, unknown>> };
  const raw = Array.isArray(data?.history) ? data.history : [];
  const history: StatusHistoryEntry[] = raw.map((r, i) => {
    const id = Number(r.id ?? 0) || i + 1;
    const action = typeof r.action === "string" ? r.action : "status_change";
    const atRaw = r.at ?? r.created_at ?? (r as Record<string, unknown>).createdAt;
    let at: string;
    if (typeof atRaw === "string" && atRaw.trim() !== "") {
      at = atRaw.trim();
    } else if (typeof atRaw === "number" && Number.isFinite(atRaw)) {
      at = atRaw > 1e12 ? new Date(atRaw).toISOString() : new Date(atRaw * 1000).toISOString();
    } else if (atRaw != null && typeof (atRaw as Date).toISOString === "function") {
      at = (atRaw as Date).toISOString();
    } else {
      at = new Date().toISOString();
    }
    return {
      id,
      action,
      restriction_type: typeof r.restriction_type === "string" ? r.restriction_type : null,
      performed_by: typeof r.performed_by === "string" ? r.performed_by : null,
      reason: typeof r.reason === "string" ? r.reason : null,
      at,
    };
  });
  return { history };
}

export async function getStoreStatusWeekly(
  storeId: number,
  token: string
): Promise<{ days: WeeklyDay[] }> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/status/weekly`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to load weekly data");
  }
  const data = (await res.json()) as { days?: WeeklyDay[] };
  const days = Array.isArray(data?.days) ? data.days : [];
  return { days };
}

export async function getStoreStatus(
  storeId: number,
  token: string
): Promise<StoreStatus> {
  try {
  const storeIdNum = typeof storeId === "number" && Number.isFinite(storeId) ? storeId : parseInt(String(storeId), 10);
  if (!Number.isFinite(storeIdNum) || storeIdNum < 1) throw new Error("Invalid store");
  const tokenStr = token != null ? String(token).trim() : "";
  if (!tokenStr) throw new Error("Session required");
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeIdNum}/status`,
    tokenStr
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to load store status");
  }
  let data: Record<string, unknown>;
  try {
    const raw = await res.json();
    data = raw != null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    throw new Error("Invalid response from server");
  }
  const rawManual = data?.manual_close_until;
  let manualCloseUntil: string | null = null;
  if (typeof rawManual === "string" && rawManual.trim().length > 0) {
    const normalized = rawManual.trim().replace(" ", "T");
    const d = new Date(normalized);
    manualCloseUntil = Number.isNaN(d.getTime()) ? rawManual.trim() : d.toISOString();
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

  const rawManualReason = data?.manual_close_reason;
  const manualCloseReason =
    typeof rawManualReason === "string" && rawManualReason.length > 0
      ? rawManualReason.trim()
      : rawManualReason != null
        ? String(rawManualReason).trim() || null
        : null;

  const rawManualStart = data?.manual_close_start_at;
  const manualCloseStartAt =
    typeof rawManualStart === "string" && rawManualStart.length > 0
      ? rawManualStart.trim()
      : rawManualStart != null
        ? (typeof rawManualStart === "number" ? new Date(rawManualStart).toISOString() : String(rawManualStart).trim() || null)
        : null;
  const rawClosedBy = data?.closed_by;
  const closedBy =
    typeof rawClosedBy === "string" && rawClosedBy.length > 0
      ? rawClosedBy.trim()
      : rawClosedBy != null
        ? String(rawClosedBy).trim() || null
        : null;
  const rawClosedById = data?.closed_by_id;
  const closedById =
    typeof rawClosedById === "string" && rawClosedById.length > 0
      ? rawClosedById.trim()
      : rawClosedById != null
        ? String(rawClosedById).trim() || null
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

  const statusReason =
    typeof data?.status_reason === "string" && (data.status_reason as string).trim() !== ""
      ? (data.status_reason as string).trim()
      : null;
  const unavailableReason =
    typeof data?.unavailable_reason === "string" && (data.unavailable_reason as string).trim() !== ""
      ? (data.unavailable_reason as string).trim()
      : data?.unavailable_reason != null
        ? String(data.unavailable_reason)
        : null;
  const nextOpenTime =
    typeof data?.next_open_time === "string" && (data.next_open_time as string).trim() !== ""
      ? (data.next_open_time as string).trim()
      : null;
  const nextCloseTime =
    typeof data?.next_close_time === "string" && (data.next_close_time as string).trim() !== ""
      ? (data.next_close_time as string).trim()
      : null;
  const rawNextOpenIso = data?.next_open_iso;
  let nextOpenIso: string | null = null;
  if (typeof rawNextOpenIso === "string" && rawNextOpenIso.trim() !== "") {
    nextOpenIso = rawNextOpenIso.trim();
  } else if (typeof rawNextOpenIso === "number" && Number.isFinite(rawNextOpenIso)) {
    const d = new Date(rawNextOpenIso);
    nextOpenIso = Number.isNaN(d.getTime()) ? null : d.toISOString();
  } else if (rawNextOpenIso != null && typeof (rawNextOpenIso as Date).toISOString === "function") {
    nextOpenIso = (rawNextOpenIso as Date).toISOString();
  }

  return {
    store_id: Number(data.store_id ?? storeIdNum),
    is_open: data.is_open === true,
    is_accepting_orders: data.is_accepting_orders === true,
    is_available: data.is_available !== false,
    auto_open_from_schedule: data.auto_open_from_schedule !== false,
    block_auto_open: data.block_auto_open === true,
    manual_close_until: manualCloseUntil,
    manual_close_reason: manualCloseReason,
    manual_close_start_at: manualCloseStartAt,
    closed_by: closedBy,
    closed_by_id: closedById,
    restriction_type: restrictionType,
    scheduled_closure: scheduledClosure,
    scheduled_closure_upcoming: (data as any).scheduled_closure_upcoming ?? null,
    status_reason: statusReason,
    unavailable_reason: unavailableReason,
    next_open_time: nextOpenTime,
    next_close_time: nextCloseTime,
    next_open_iso: nextOpenIso,
  };
  } catch (e) {
    if (e instanceof Error && e.message) throw e;
    throw new Error("Failed to load store status");
  }
}

export type UpdateStoreStatusOptions = {
  manual_close_until?: string | null;
  manual_close_reason?: string | null;
};

export async function updateStoreStatus(
  storeId: number,
  isOpen: boolean,
  token: string,
  options?: UpdateStoreStatusOptions
): Promise<StoreStatus> {
  try {
    if (storeId == null || (typeof storeId !== "number" && typeof storeId !== "string")) {
      throw new Error("Please select a store first.");
    }
    const storeIdNum =
      typeof storeId === "number" && Number.isFinite(storeId)
        ? storeId
        : typeof storeId === "string"
          ? parseInt(storeId, 10)
          : Number(storeId);
    const tokenStr = token != null ? String(token).trim() : "";
    if (!Number.isFinite(storeIdNum) || storeIdNum < 1 || !tokenStr) {
      throw new Error("Please select a store first.");
    }
    const body: Record<string, unknown> = { is_open: isOpen };
    if (options && typeof options === "object") {
      if (options.manual_close_until !== undefined) body.manual_close_until = options.manual_close_until;
      if (options.manual_close_reason !== undefined) body.manual_close_reason = options.manual_close_reason;
    }
    const res = await authFetch(
      `${getBase()}/v1/merchant-partner/stores/${storeIdNum}/status`,
      tokenStr,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg = (typeof err?.message === "string" && err.message.trim()) || (typeof err?.error === "string" && err.error.trim()) || res.statusText || "Failed to update store status";
      throw new Error(msg);
    }
    let data: Record<string, unknown>;
    try {
      const raw = await res.json();
      data = raw != null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch {
      throw new Error("Invalid response from server");
    }
    const rawManual = data?.manual_close_until;
    let manualCloseUntil: string | null = null;
    if (typeof rawManual === "string" && rawManual.length > 0) {
      const normalized = rawManual.trim().replace(" ", "T");
      const d = new Date(normalized);
      manualCloseUntil = Number.isNaN(d.getTime()) ? rawManual : d.toISOString();
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

    const rawManualReason = data?.manual_close_reason;
    const manualCloseReason =
      typeof rawManualReason === "string" && rawManualReason.length > 0
        ? rawManualReason.trim()
        : rawManualReason != null
          ? String(rawManualReason).trim() || null
          : null;
    const rawManualStart = data?.manual_close_start_at;
    const manualCloseStartAt =
      typeof rawManualStart === "string" && rawManualStart.length > 0
        ? rawManualStart.trim()
        : rawManualStart != null
          ? (typeof rawManualStart === "number" ? new Date(rawManualStart).toISOString() : String(rawManualStart).trim() || null)
          : null;
    const rawClosedBy = data?.closed_by;
    const closedBy =
      typeof rawClosedBy === "string" && rawClosedBy.length > 0
        ? rawClosedBy.trim()
        : rawClosedBy != null
          ? String(rawClosedBy).trim() || null
          : null;

    return {
      store_id: Number(data.store_id ?? storeIdNum),
      is_open: data.is_open === true,
      is_accepting_orders: data.is_accepting_orders === true,
      is_available: data.is_available !== false,
      auto_open_from_schedule: data.auto_open_from_schedule !== false,
      block_auto_open: data.block_auto_open === true,
      manual_close_until: manualCloseUntil,
      manual_close_reason: manualCloseReason,
      manual_close_start_at: manualCloseStartAt,
      closed_by: closedBy,
      restriction_type: restrictionType,
      scheduled_closure: null,
    };
  } catch (e) {
    if (e instanceof Error && e.message && e.message.trim() && e.message.trim() !== "TypeError") throw e;
    throw new Error("Failed to update store status");
  }
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

  const rawManualReason = data?.manual_close_reason;
  const manualCloseReason =
    typeof rawManualReason === "string" && rawManualReason.length > 0
      ? rawManualReason.trim()
      : rawManualReason != null
        ? String(rawManualReason).trim() || null
        : null;
  const manualCloseStartAt =
    typeof data?.manual_close_start_at === "string" && (data.manual_close_start_at as string).length > 0
      ? (data.manual_close_start_at as string).trim()
      : null;
  const closedBy =
    typeof data?.closed_by === "string" && (data.closed_by as string).length > 0
      ? (data.closed_by as string).trim()
      : null;

  return {
    store_id: Number(data.store_id ?? storeId),
    is_open: data.is_open === true,
    is_accepting_orders: data.is_accepting_orders === true,
    is_available: data.is_available !== false,
    auto_open_from_schedule: data.auto_open_from_schedule !== false,
    block_auto_open: data.block_auto_open === true,
    manual_close_until: manualCloseUntil,
    manual_close_reason: manualCloseReason,
    manual_close_start_at: manualCloseStartAt,
    closed_by: closedBy,
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

  const rawManualReason = data?.manual_close_reason;
  const manualCloseReason =
    typeof rawManualReason === "string" && rawManualReason.length > 0
      ? rawManualReason.trim()
      : rawManualReason != null
        ? String(rawManualReason).trim() || null
        : null;
  const manualCloseStartAt =
    typeof data?.manual_close_start_at === "string" && (data.manual_close_start_at as string).length > 0
      ? (data.manual_close_start_at as string).trim()
      : null;
  const closedBy =
    typeof data?.closed_by === "string" && (data.closed_by as string).length > 0
      ? (data.closed_by as string).trim()
      : null;

  return {
    store_id: Number(data.store_id ?? storeId),
    is_open: data.is_open === true,
    is_accepting_orders: data.is_accepting_orders === true,
    is_available: data.is_available !== false,
    auto_open_from_schedule: data.auto_open_from_schedule !== false,
    block_auto_open: data.block_auto_open === true,
    manual_close_until: manualCloseUntil,
    manual_close_reason: manualCloseReason,
    manual_close_start_at: manualCloseStartAt,
    closed_by: closedBy,
    restriction_type: restrictionType,
    scheduled_closure: null,
  };
}

