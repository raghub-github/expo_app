/**
 * Store status (open/closed, auto-open from schedule, manual lock, temp close) — backend only.
 * The backend schedule engine and merchant_store_availability own all logic; this app only
 * reads status and sends toggle/flag updates via API. Do not duplicate schedule or open/close logic here.
 */
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
  // Production safety net — same reasoning as customer_app/RazorpayCheckoutModal.
  if (!__DEV__) return "https://api.gatimitra.com";
  return "http://localhost:3000";
}

/**
 * Strings without a timezone are parsed as local wall time on the device (wrong off-IST).
 * Treat bare `YYYY-MM-DDTHH:mm…` as Asia/Kolkata (same as schedule / dashboard semantics).
 */
function parseApiInstantToIso(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  let s = t.replace(" ", "T");
  // Normalize timezone offsets so JS Date parsing is consistent across platforms:
  // - "+0530" -> "+05:30"
  // - "+00"   -> "+00:00"
  // - "+0000" -> "+00:00"
  // Keep "Z" as-is.
  if (!/[zZ]$/.test(s)) {
    s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"); // +hhmm
    s = s.replace(/([+-]\d{2})$/, "$1:00"); // +hh
  }
  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(`${s}+05:30`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Merge overlapping GET /status calls (Strict Mode double-mount, header + poll race). */
const storeStatusInFlight = new Map<number, Promise<StoreStatus>>();

export type ScheduledClosure = {
  from: string;
  to: string;
  reason: string;
  marked_from?: string | null;
};

export type ActiveRushWindow = {
  is_active: boolean;
  duration_minutes: number | null;
  remaining_minutes: number;
  started_at: string | null;
  ends_at: string | null;
  marked_from?: string | null;
};

export type StoreStatus = {
  store_id: number;
  is_open: boolean;
  /** OPEN | CLOSED from merchant_stores (Partner Site parity). */
  operational_status?: string | null;
  /** Inside an active operating slot (false during break / outside hours). */
  within_operating_hours?: boolean;
  is_accepting_orders: boolean;
  is_available: boolean;
  auto_open_from_schedule: boolean;
  block_auto_open: boolean;
  is_manual_override?: boolean;
  schedule_end_prompt_active?: boolean;
  schedule_end_prompt_expires_at?: string | null;
  manual_close_until: string | null;
  /** Auto reopen instant from `merchant_store_availability.auto_available_at` (schedule engine). */
  auto_available_at?: string | null;
  manual_close_reason: string | null;
  manual_close_start_at: string | null;
  closed_by: string | null;
  closed_by_id?: string | null;
  last_toggle_type?: string | null;
  last_toggled_at?: string | null;
  last_toggled_by_email?: string | null;
  last_toggled_by_name?: string | null;
  last_toggled_by_id?: string | null;
  restriction_type: string | null;
  scheduled_closure: ScheduledClosure | null;
  scheduled_closure_upcoming?: ScheduledClosure | null;
  active_rush?: ActiveRushWindow | null;
  status_reason?: string | null;
  unavailable_reason?: string | null;
  next_open_time?: string | null;
  next_close_time?: string | null;
  next_open_iso?: string | null;
  /** When true, hide schedule countdown (store inside hours but held closed — dashboard / Partner parity). */
  within_hours_but_restricted?: boolean;
  is_delisted?: boolean;
  approval_status?: string | null;
  license_blocked?: boolean;
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
  const storeIdNumEarly = typeof storeId === "number" && Number.isFinite(storeId) ? storeId : parseInt(String(storeId), 10);
  if (!Number.isFinite(storeIdNumEarly) || storeIdNumEarly < 1) {
    return Promise.reject(new Error("Invalid store"));
  }
  const tokenStr = token != null ? String(token).trim() : "";
  if (!tokenStr) {
    return Promise.reject(new Error("Session required"));
  }
  const existing = storeStatusInFlight.get(storeIdNumEarly);
  if (existing) return existing;

  const promise = fetchStoreStatusOnce(storeIdNumEarly, tokenStr).finally(() => {
    storeStatusInFlight.delete(storeIdNumEarly);
  });
  storeStatusInFlight.set(storeIdNumEarly, promise);
  return promise;
}

async function fetchStoreStatusOnce(storeIdNum: number, tokenStr: string): Promise<StoreStatus> {
  try {
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
    manualCloseUntil = parseApiInstantToIso(rawManual) ?? rawManual.trim();
  } else if (typeof rawManual === "number" && Number.isFinite(rawManual)) {
    const d = new Date(rawManual);
    manualCloseUntil = Number.isNaN(d.getTime()) ? null : d.toISOString();
  } else if (rawManual != null && typeof (rawManual as Date).getTime === "function") {
    manualCloseUntil = (rawManual as Date).toISOString();
  }

  const rawAutoAvail = (data as any)?.auto_available_at;
  let autoAvailableAt: string | null = null;
  if (typeof rawAutoAvail === "string" && rawAutoAvail.trim().length > 0) {
    autoAvailableAt = parseApiInstantToIso(rawAutoAvail) ?? rawAutoAvail.trim();
  } else if (typeof rawAutoAvail === "number" && Number.isFinite(rawAutoAvail)) {
    const d = new Date(rawAutoAvail);
    autoAvailableAt = Number.isNaN(d.getTime()) ? null : d.toISOString();
  } else if (rawAutoAvail != null && typeof (rawAutoAvail as Date).toISOString === "function") {
    autoAvailableAt = (rawAutoAvail as Date).toISOString();
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

  const parseClosure = (raw: unknown): ScheduledClosure | null => {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const from = r.from != null ? String(r.from) : "";
    const to = r.to != null ? String(r.to) : "";
    const reason = r.reason != null ? String(r.reason) : "Scheduled off";
    if (from === "" && to === "" && reason === "") return null;
    const marked_from =
      r.marked_from != null && String(r.marked_from).trim() !== "" ? String(r.marked_from).trim() : null;
    return {
      from: from || to || "scheduled date",
      to: to || from || "scheduled date",
      reason,
      marked_from,
    };
  };

  const scheduledClosure = parseClosure(data?.scheduled_closure);
  const scheduled_closure_upcoming = parseClosure((data as { scheduled_closure_upcoming?: unknown }).scheduled_closure_upcoming);

  let active_rush: ActiveRushWindow | null = null;
  const rawRush = (data as { active_rush?: unknown }).active_rush;
  if (rawRush != null && typeof rawRush === "object" && !Array.isArray(rawRush)) {
    const r = rawRush as Record<string, unknown>;
    if (r.is_active === true) {
      const remaining = Number(r.remaining_minutes);
      active_rush = {
        is_active: true,
        duration_minutes: typeof r.duration_minutes === "number" ? r.duration_minutes : null,
        remaining_minutes: Number.isFinite(remaining) ? remaining : 0,
        started_at: typeof r.started_at === "string" ? r.started_at : null,
        ends_at: typeof r.ends_at === "string" ? r.ends_at : null,
        marked_from:
          r.marked_from != null && String(r.marked_from).trim() !== "" ? String(r.marked_from).trim() : null,
      };
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
    const parsed = parseApiInstantToIso(rawNextOpenIso);
    nextOpenIso = parsed ?? rawNextOpenIso.trim();
  } else if (typeof rawNextOpenIso === "number" && Number.isFinite(rawNextOpenIso)) {
    const d = new Date(rawNextOpenIso);
    nextOpenIso = Number.isNaN(d.getTime()) ? null : d.toISOString();
  } else if (rawNextOpenIso != null && typeof (rawNextOpenIso as Date).toISOString === "function") {
    nextOpenIso = (rawNextOpenIso as Date).toISOString();
  }

  const withinHoursButRestricted = data?.within_hours_but_restricted === true;
  const isDelisted =
    data?.is_delisted === true ||
    (data?.delisted_at != null && String(data.delisted_at).trim() !== "") ||
    String(data?.approval_status ?? "").toUpperCase() === "DELISTED";
  const approvalStatus =
    typeof data?.approval_status === "string" && String(data.approval_status).trim()
      ? String(data.approval_status).trim().toUpperCase()
      : null;
  const lastToggleType =
    typeof (data as any)?.last_toggle_type === "string" ? String((data as any).last_toggle_type).trim() || null : null;
  const lastToggledAt =
    typeof (data as any)?.last_toggled_at === "string" ? String((data as any).last_toggled_at).trim() || null : null;
  const lastToggledByEmail =
    typeof (data as any)?.last_toggled_by_email === "string" ? String((data as any).last_toggled_by_email).trim() || null : null;
  const lastToggledByName =
    typeof (data as any)?.last_toggled_by_name === "string" ? String((data as any).last_toggled_by_name).trim() || null : null;
  const lastToggledById =
    typeof (data as any)?.last_toggled_by_id === "string" ? String((data as any).last_toggled_by_id).trim() || null : null;

  return {
    store_id: Number(data.store_id ?? storeIdNum),
    is_open: data.is_open === true && !isDelisted,
    is_delisted: isDelisted,
    approval_status: approvalStatus,
    operational_status:
      typeof data.operational_status === "string" ? data.operational_status.trim().toUpperCase() : null,
    within_operating_hours: data.within_operating_hours === true,
    is_accepting_orders: data.is_accepting_orders === true,
    is_available: data.is_available !== false,
    auto_open_from_schedule: data.auto_open_from_schedule !== false,
    block_auto_open: data.block_auto_open === true,
    is_manual_override: (data as any).is_manual_override === true,
    schedule_end_prompt_active: (data as any).schedule_end_prompt_active === true,
    schedule_end_prompt_expires_at:
      typeof (data as any).schedule_end_prompt_expires_at === "string"
        ? String((data as any).schedule_end_prompt_expires_at).trim() || null
        : null,
    manual_close_until: manualCloseUntil,
    auto_available_at: autoAvailableAt,
    manual_close_reason: manualCloseReason,
    manual_close_start_at: manualCloseStartAt,
    closed_by: closedBy,
    closed_by_id: closedById,
    last_toggle_type: lastToggleType,
    last_toggled_at: lastToggledAt,
    last_toggled_by_email: lastToggledByEmail,
    last_toggled_by_name: lastToggledByName,
    last_toggled_by_id: lastToggledById,
    restriction_type: restrictionType,
    scheduled_closure: scheduledClosure,
    scheduled_closure_upcoming,
    active_rush,
    status_reason: statusReason,
    unavailable_reason: unavailableReason,
    next_open_time: nextOpenTime,
    next_close_time: nextCloseTime,
    next_open_iso: nextOpenIso,
    within_hours_but_restricted: withinHoursButRestricted,
    license_blocked: data?.license_blocked === true,
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
      const errCode = typeof err?.error === "string" ? err.error.trim() : "";
      const msg =
        (typeof err?.message === "string" && err.message.trim()) ||
        errCode ||
        (typeof err?.error === "string" && err.error.trim()) ||
        res.statusText ||
        "Failed to update store status";
      if (errCode === "outside_operating_hours") {
        const e = new Error(msg);
        (e as Error & { code?: string }).code = "outside_operating_hours";
        throw e;
      }
      if (errCode === "LICENSE_BLOCKED") {
        const e = new Error(
          msg ||
            "You cannot go online until expired documents are uploaded and verified by GatiMitra."
        );
        (e as Error & { code?: string }).code = "LICENSE_BLOCKED";
        throw e;
      }
      const nestedCode = typeof err?.code === "string" ? err.code.trim() : "";
      if (errCode === "STORE_DELISTED" || nestedCode === "STORE_DELISTED") {
        const e = new Error(msg);
        (e as Error & { code?: string }).code = "STORE_DELISTED";
        throw e;
      }
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
      manualCloseUntil = parseApiInstantToIso(rawManual) ?? rawManual.trim();
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
      is_manual_override: (data as any).is_manual_override === true,
      schedule_end_prompt_active: (data as any).schedule_end_prompt_active === true,
      schedule_end_prompt_expires_at:
        typeof (data as any).schedule_end_prompt_expires_at === "string"
          ? String((data as any).schedule_end_prompt_expires_at).trim() || null
          : null,
      manual_close_until: manualCloseUntil,
      manual_close_reason: manualCloseReason,
      manual_close_start_at: manualCloseStartAt,
      closed_by: closedBy,
      closed_by_id: typeof (data as any).closed_by_id === "string" ? String((data as any).closed_by_id).trim() || null : null,
      restriction_type: restrictionType,
      scheduled_closure: null,
      scheduled_closure_upcoming: null,
      status_reason: typeof data.status_reason === "string" ? data.status_reason.trim() || null : null,
      unavailable_reason: typeof data.unavailable_reason === "string" ? data.unavailable_reason.trim() || null : null,
      next_open_time: null,
      next_close_time: null,
      next_open_iso: null,
      within_hours_but_restricted: data?.within_hours_but_restricted === true,
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

export async function respondScheduleEndPrompt(
  storeId: number,
  token: string,
  action: "stay_online" | "go_offline"
): Promise<{ ok: boolean; action: string }> {
  const storeIdNum = typeof storeId === "number" ? storeId : parseInt(String(storeId), 10);
  const tokenStr = token != null ? String(token).trim() : "";
  if (!Number.isFinite(storeIdNum) || storeIdNum < 1 || !tokenStr) {
    throw new Error("Session required");
  }
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeIdNum}/status/schedule-end-response`,
    tokenStr,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (typeof (data as any)?.message === "string" && (data as any).message.trim()) ||
      (typeof (data as any)?.error === "string" && (data as any).error.trim()) ||
      res.statusText ||
      "Failed to update";
    throw new Error(msg);
  }
  return { ok: (data as any)?.ok === true, action: String((data as any)?.action ?? action) };
}

