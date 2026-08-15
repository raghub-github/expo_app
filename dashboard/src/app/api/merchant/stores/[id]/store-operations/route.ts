/**
 * GET /api/merchant/stores/[id]/store-operations
 * Returns store open/closed status and operating info (for Store overview).
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserPermissions, hasDashboardAccess, hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getMerchantStoreById, updateMerchantStore } from "@/lib/db/operations/merchant-stores";
import { isStoreDelisted } from "@/lib/merchants/store-delist";
import { insertActivityLog } from "@/lib/db/operations/merchant-portal-activity-logs";
import { getSql } from "@/lib/db/client";
import {
  DEFAULT_STORE_TIMEZONE,
  getNextOpenDayStartIso,
  getNextOpenIso,
  getNextOpenIsoAfterIstCalendarDay,
  isLikelyLegacyEndOfDayIstClose,
  isWithinOperatingHours,
  nowInStoreTz,
} from "@/lib/merchantStoreNextOpenIso";
import {
  computeNextScheduleTransitionIso,
  computeOpensAtIso,
  computeScheduleCountdown,
  evaluateStoreSchedule,
  isBeforeFirstSlotToday,
  schedulePhaseLabel,
} from "@/lib/storeScheduleEngine";
import { triggerStoreScheduleTick } from "@/lib/triggerStoreScheduleTick";

export const runtime = "nodejs";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
type DayKey = (typeof DAY_KEYS)[number];

function serializeTime(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    return /^\d{1,2}:\d{2}(:\d{2})?$/.test(s) ? s.slice(0, 5) : null;
  }
  if (v instanceof Date) return v.toTimeString().slice(0, 5);
  return null;
}

function endOfTodayIstIso(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) return new Date().toISOString();
  return new Date(`${y}-${m}-${d}T23:59:59.999+05:30`).toISOString();
}

function endOfTodayIst(): Date {
  return new Date(endOfTodayIstIso());
}

/** Partner Site: map DB `manual` + until → TEMPORARY | CLOSED_TODAY | MANUAL_HOLD for UI labels. */
function deriveDisplayRestrictionType(args: {
  restriction_type: string | null | undefined;
  unavailable_reason: string | null | undefined;
  manual_close_until: string | null | undefined;
}): string | null {
  const raw = args.restriction_type ?? null;
  const unavail = args.unavailable_reason ?? null;
  const isManualClose =
    raw === "manual" ||
    raw === "manual_hold" ||
    unavail === "manual_close" ||
    unavail === "manual_indefinite";
  if (!isManualClose) return raw;

  const untilRaw = args.manual_close_until;
  if (!untilRaw) return "MANUAL_HOLD";

  const until = new Date(String(untilRaw).trim().replace(" ", "T"));
  if (Number.isNaN(until.getTime())) return "TEMPORARY";

  const endToday = endOfTodayIst();
  if (Math.abs(until.getTime() - endToday.getTime()) <= 120_000) return "CLOSED_TODAY";
  return "TEMPORARY";
}

async function ensureAvailabilityRow(storeId: number): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO merchant_store_availability (
      store_id, is_available, is_accepting_orders, block_auto_open, auto_open_from_schedule
    )
    SELECT ${storeId}, false, false, false, true
    WHERE NOT EXISTS (
      SELECT 1 FROM merchant_store_availability WHERE store_id = ${storeId}
    )
  `;
}

/**
 * manual_close_until for POST — temporary uses explicit time/duration; "today" = next open on a future IST calendar day (skip all slots later today).
 */
function computeManualCloseUntilIso(body: Record<string, unknown>, oh: Record<string, unknown> | null): string | null {
  const closureType = String(body.closure_type || "");
  const closureDate = typeof body.closure_date === "string" ? body.closure_date.trim() : "";
  const closureTime = typeof body.closure_time === "string" ? body.closure_time.trim() : "";
  const bodyManualUntil =
    typeof body.manual_close_until === "string" && body.manual_close_until.trim() !== ""
      ? body.manual_close_until.trim()
      : null;

  if (bodyManualUntil) {
    const normalized = bodyManualUntil.replace(" ", "T");
    // Bare datetimes are IST wall time (parity with dashboard UI + Partner Site).
    const d =
      !/[zZ]$/.test(normalized) && !/[+-]\d{2}:\d{2}$/.test(normalized) && /^\d{4}-\d{2}-\d{2}T/.test(normalized)
        ? new Date(`${normalized}+05:30`)
        : new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  if (closureType === "temporary") {
    if (closureDate && closureTime) {
      // Dashboard date/time inputs are IST wall time; treat them as Asia/Kolkata (not server-local/UTC).
      const timeNorm = /^\d{2}:\d{2}:\d{2}$/.test(closureTime) ? closureTime : `${closureTime}:00`;
      const d = new Date(`${closureDate}T${timeNorm}+05:30`);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    const dm = body.duration_minutes;
    const mins = typeof dm === "number" ? dm : parseInt(String(dm ?? ""), 10);
    if (Number.isFinite(mins) && mins > 0 && mins <= 10080) {
      return new Date(Date.now() + mins * 60 * 1000).toISOString();
    }
    return null;
  }

  if (closureType === "today") {
    if (oh && Object.keys(oh).length > 0) {
      const { dayOfWeek } = nowInStoreTz();
      const next =
        getNextOpenIsoAfterIstCalendarDay(oh, dayOfWeek, new Date()) ??
        getNextOpenDayStartIso(oh, dayOfWeek, new Date());
      if (next) return next;
    }
    return endOfTodayIstIso();
  }

  return null;
}

type StoreOpsStoreRow = {
  id: number;
  store_id: string;
  approval_status: string | null;
  operational_status: string | null;
  is_active: boolean | null;
  is_accepting_orders: boolean | null;
  is_available: boolean | null;
  deleted_at: string | Date | null;
  delisted_at: string | Date | null;
};

/** Slim store row for GET — avoids gallery/parent payload that delayed the status card. */
async function getStoreOpsStoreRow(
  storeId: number,
  areaManagerId: number | null
): Promise<StoreOpsStoreRow | null> {
  const sql = getSql();
  const rows =
    areaManagerId != null
      ? await sql`
          SELECT id, store_id, approval_status, operational_status, is_active,
                 is_accepting_orders, is_available, deleted_at, delisted_at
          FROM merchant_stores
          WHERE id = ${storeId} AND deleted_at IS NULL AND area_manager_id = ${areaManagerId}
          LIMIT 1
        `
      : await sql`
          SELECT id, store_id, approval_status, operational_status, is_active,
                 is_accepting_orders, is_available, deleted_at, delisted_at
          FROM merchant_stores
          WHERE id = ${storeId} AND deleted_at IS NULL
          LIMIT 1
        `;
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? (row as StoreOpsStoreRow) : null;
}

function getTodayContextInIST(): { todayDate: string; dayKey: DayKey } {
  const now = new Date();
  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
  })
    .format(now)
    .toLowerCase() as DayKey;
  return {
    todayDate,
    dayKey: DAY_KEYS.includes(weekday) ? weekday : "monday",
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const userPerms = await getUserPermissions(user.id, user.email);
    if (!userPerms) {
      return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });
    }
    if (!userPerms.isSuperAdmin) {
      const allowed = await hasDashboardAccess(userPerms.systemUserId, "MERCHANT");
      if (!allowed) {
        return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });
      }
    }
    const areaManagerId = userPerms.isSuperAdmin
      ? null
      : await resolveMerchantListAreaManagerId({
          supabaseAuthId: user.id,
          email: user.email,
        });
    const store = await getStoreOpsStoreRow(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    // Availability insert + schedule tick must not block the status card paint.
    void ensureAvailabilityRow(storeId).catch(() => undefined);
    if (!isStoreDelisted(store)) {
      void triggerStoreScheduleTick(storeId).catch(() => undefined);
    }

    // Derive effective operational status from DB row (Partner Site gate).
    // A store is only truly OPEN when:
    // - approval_status = APPROVED
    // - is_active, is_accepting_orders and is_available are true
    // - operational_status is OPEN
    // - store is not deleted or delisted
    const approval = String(store.approval_status || "").toUpperCase();
    const rawOperational = String(store.operational_status || "CLOSED").toUpperCase();
    const isDelisted = isStoreDelisted(store);
    const isTrulyOpen =
      !isDelisted &&
      approval === "APPROVED" &&
      store.is_active === true &&
      store.is_accepting_orders === true &&
      store.is_available === true &&
      rawOperational === "OPEN" &&
      !store.deleted_at &&
      !store.delisted_at;

    const effectiveOperationalStatus = isTrulyOpen ? "OPEN" : "CLOSED";

    const { todayDate, dayKey } = getTodayContextInIST();
    const sql = getSql();
    const closureNowIso = new Date().toISOString();
    const [operatingRows, availRows, schedClosureRows, rushRows] = await Promise.all([
      sql`
        SELECT is_24_hours, closed_days, same_for_all_days,
               monday_open, monday_slot1_start, monday_slot1_end, monday_slot2_start, monday_slot2_end,
               tuesday_open, tuesday_slot1_start, tuesday_slot1_end, tuesday_slot2_start, tuesday_slot2_end,
               wednesday_open, wednesday_slot1_start, wednesday_slot1_end, wednesday_slot2_start, wednesday_slot2_end,
               thursday_open, thursday_slot1_start, thursday_slot1_end, thursday_slot2_start, thursday_slot2_end,
               friday_open, friday_slot1_start, friday_slot1_end, friday_slot2_start, friday_slot2_end,
               saturday_open, saturday_slot1_start, saturday_slot1_end, saturday_slot2_start, saturday_slot2_end,
               sunday_open, sunday_slot1_start, sunday_slot1_end, sunday_slot2_start, sunday_slot2_end
        FROM merchant_store_operating_hours
        WHERE store_id = ${storeId}
        LIMIT 1
      `,
      sql`
        SELECT manual_close_until, block_auto_open, close_reason, restriction_type, unavailable_reason,
               last_toggled_at, last_toggled_by_email, last_toggled_by_name, last_toggled_by_id, last_toggle_type,
               is_manual_override, schedule_end_prompt_expires_at, schedule_end_prompted_at
        FROM merchant_store_availability
        WHERE store_id = ${storeId}
        LIMIT 1
      `,
      sql`
        SELECT id, reason, starts_at, ends_at, status, marked_from
        FROM merchant_store_scheduled_closures
        WHERE store_id = ${storeId}
          AND status IN ('scheduled', 'active')
          AND ends_at > ${closureNowIso}
        ORDER BY starts_at ASC
      `,
      sql`
        SELECT duration_minutes, started_at, ends_at, marked_from
        FROM merchant_store_rush_windows
        WHERE store_id = ${storeId}
          AND is_active = TRUE
          AND ends_at > NOW()
        ORDER BY started_at DESC
        LIMIT 1
      `,
    ]);
    const operating = Array.isArray(operatingRows) ? operatingRows[0] : operatingRows;
    const todaySlots: { start: string; end: string }[] = [];
    let isTodayScheduledClosed = true;

    if (operating) {
      const row = operating as Record<string, unknown>;
      const is24Hours = row.is_24_hours === true;
      const closedDays = Array.isArray(row.closed_days) ? row.closed_days : [];
      const isMarkedClosed = closedDays
        .map((v) => String(v).toLowerCase())
        .includes(dayKey);

      if (!isMarkedClosed) {
        if (is24Hours) {
          todaySlots.push({ start: "00:00", end: "23:59" });
        } else if (row[`${dayKey}_open`] === true) {
          const slot1Start = serializeTime(row[`${dayKey}_slot1_start`]);
          const slot1End = serializeTime(row[`${dayKey}_slot1_end`]);
          const slot2Start = serializeTime(row[`${dayKey}_slot2_start`]);
          const slot2End = serializeTime(row[`${dayKey}_slot2_end`]);
          if (slot1Start && slot1End) todaySlots.push({ start: slot1Start, end: slot1End });
          if (slot2Start && slot2End) todaySlots.push({ start: slot2Start, end: slot2End });
        }
      }

      isTodayScheduledClosed = todaySlots.length === 0;
    }

    const availRow = Array.isArray(availRows) ? availRows[0] : availRows;
    const av = (availRow ?? {}) as Record<string, unknown>;
    const blockAutoOpen = av.block_auto_open === true;
    const closeReason = av.close_reason != null && String(av.close_reason).trim() !== "" ? String(av.close_reason) : null;
    let manualCloseUntil: string | null = null;
    if (av.manual_close_until != null && String(av.manual_close_until).trim() !== "") {
      const t = new Date(String(av.manual_close_until));
      manualCloseUntil = Number.isNaN(t.getTime()) ? null : t.toISOString();
    }
    let lastToggledAt: string | null = null;
    if (av.last_toggled_at != null && String(av.last_toggled_at).trim() !== "") {
      const t2 = new Date(String(av.last_toggled_at));
      lastToggledAt = Number.isNaN(t2.getTime()) ? null : t2.toISOString();
    }
    const lastToggledByEmail = av.last_toggled_by_email != null ? String(av.last_toggled_by_email) : null;
    const lastToggledByName = av.last_toggled_by_name != null ? String(av.last_toggled_by_name) : null;
    const lastToggledById = av.last_toggled_by_id != null ? String(av.last_toggled_by_id) : null;
    const lastToggleType = av.last_toggle_type != null ? String(av.last_toggle_type) : null;
    const unavailableReason = av.unavailable_reason != null ? String(av.unavailable_reason) : null;
    const restrictionTypeOut = deriveDisplayRestrictionType({
      restriction_type: av.restriction_type != null ? String(av.restriction_type) : null,
      unavailable_reason: unavailableReason,
      manual_close_until: manualCloseUntil,
    });

    // merchant_stores has no timezone column; schedule engine uses IST default (Partner Site parity).
    const storeTz = DEFAULT_STORE_TIMEZONE;

    const ohRecord = (operating ?? null) as Record<string, unknown> | null;
    const schedule = evaluateStoreSchedule(ohRecord, storeTz);
    const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz(storeTz);
    const withinHours = schedule.withinOperatingHours;
    const nowRef = new Date();
    const nextOpenIso =
      ohRecord && Object.keys(ohRecord).length > 0
        ? getNextOpenIso(ohRecord, dayOfWeek, minutesSinceMidnight, nowRef) ??
          getNextOpenDayStartIso(ohRecord, dayOfWeek, nowRef)
        : null;
    const nextOpenIsoAfterToday =
      ohRecord && Object.keys(ohRecord).length > 0
        ? getNextOpenIsoAfterIstCalendarDay(ohRecord, dayOfWeek, nowRef) ??
          getNextOpenDayStartIso(ohRecord, dayOfWeek, nowRef)
        : null;

    let opensAt: string | null = null;
    if (effectiveOperationalStatus === "CLOSED") {
      if (manualCloseUntil) {
        opensAt = isLikelyLegacyEndOfDayIstClose(manualCloseUntil, nowRef)
          ? (nextOpenIsoAfterToday ?? nextOpenIso ?? manualCloseUntil)
          : manualCloseUntil;
      } else {
        opensAt = nextOpenIso;
      }
    }
    const unavailableNorm =
      unavailableReason != null && String(unavailableReason).trim() !== ""
        ? String(unavailableReason).trim().toLowerCase()
        : "";
    if (effectiveOperationalStatus === "CLOSED") {
      if (blockAutoOpen) {
        opensAt = null;
      } else if (!manualCloseUntil && unavailableNorm === "manual_indefinite") {
        opensAt = null;
      }
    }

    // UI flag: within-hours but held OFF without a countdown target (manual lock / manual indefinite).
    // TEMP close (manual_close_until future) must still show countdown.
    const withinHoursButRestricted =
      withinHours && effectiveOperationalStatus === "CLOSED" && (blockAutoOpen || unavailableNorm === "manual_indefinite");

    const displayOperational = effectiveOperationalStatus as "OPEN" | "CLOSED";
    const manualCloseUntilDate = manualCloseUntil ? new Date(manualCloseUntil) : null;
    const opensAtSchedule = computeOpensAtIso({
      oh: ohRecord,
      storeTimezone: storeTz,
      displayOperational,
      manualCloseUntil: manualCloseUntilDate,
      blockAutoOpen,
      unavailableReason: unavailableNorm || null,
      schedule,
      refNow: nowRef,
    });
    const opensAtOut = opensAt ?? opensAtSchedule;

    const displaySlot =
      schedule.activeSlot ??
      schedule.nextSlotToday ??
      schedule.todaySlots[0] ??
      schedule.configuredTodaySlots[0] ??
      null;

    const nextScheduleTransitionAt = computeNextScheduleTransitionIso(ohRecord, storeTz, schedule, nowRef);
    const scheduleCountdown = computeScheduleCountdown({
      oh: ohRecord,
      storeTimezone: storeTz,
      schedule,
      displayOperational,
      opensAtIso: opensAtOut,
      refNow: nowRef,
    });

    const promptExpiresRaw = av["schedule_end_prompt_expires_at"];
    let scheduleEndPromptExpiresAt: string | null = null;
    if (promptExpiresRaw != null && String(promptExpiresRaw).trim() !== "") {
      const t = new Date(String(promptExpiresRaw));
      scheduleEndPromptExpiresAt = Number.isNaN(t.getTime()) ? null : t.toISOString();
    }
    const scheduleEndPromptActive =
      scheduleEndPromptExpiresAt != null && Date.now() < new Date(scheduleEndPromptExpiresAt).getTime();

    const scheduledTimeOffs: Array<{
      id: number;
      reason: string | null;
      starts_at: string;
      ends_at: string;
      status: string;
      phase: "active" | "upcoming";
      marked_from: string | null;
    }> = [];
    const closureNowMs = Date.now();
    for (const raw of Array.isArray(schedClosureRows) ? schedClosureRows : [schedClosureRows]) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const id = Number(row.id);
      const startsAt = row.starts_at != null ? String(row.starts_at) : "";
      const endsAt = row.ends_at != null ? String(row.ends_at) : "";
      if (!Number.isFinite(id) || !startsAt || !endsAt) continue;
      const startMs = new Date(startsAt).getTime();
      const endMs = new Date(endsAt).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs >= endMs) continue;
      let phase: "active" | "upcoming";
      if (closureNowMs >= startMs && closureNowMs < endMs) phase = "active";
      else if (closureNowMs < startMs) phase = "upcoming";
      else continue;
      scheduledTimeOffs.push({
        id,
        reason: typeof row.reason === "string" && row.reason.trim() !== "" ? row.reason.trim() : null,
        starts_at: startsAt,
        ends_at: endsAt,
        status: row.status != null ? String(row.status) : "",
        phase,
        marked_from:
          row.marked_from != null && String(row.marked_from).trim() !== ""
            ? String(row.marked_from).trim()
            : null,
      });
    }

    const rushRow = (Array.isArray(rushRows) ? rushRows[0] : rushRows) as
      | {
          duration_minutes: number;
          started_at: Date | string;
          ends_at: Date | string;
          marked_from: string | null;
        }
      | undefined;
    let activeRush: Record<string, unknown> | null = null;
    if (rushRow) {
      const endsAtMs = new Date(String(rushRow.ends_at)).getTime();
      const remainingMinutes = Math.max(0, Math.floor((endsAtMs - Date.now()) / 60000));
      activeRush = {
        is_active: true,
        duration_minutes: Number(rushRow.duration_minutes),
        started_at: new Date(String(rushRow.started_at)).toISOString(),
        ends_at: new Date(String(rushRow.ends_at)).toISOString(),
        remaining_minutes: remainingMinutes,
        marked_from:
          rushRow.marked_from != null && String(rushRow.marked_from).trim() !== ""
            ? String(rushRow.marked_from).trim()
            : null,
      };
    }

    return NextResponse.json({
      success: true,
      operational_status: effectiveOperationalStatus,
      is_delisted: isDelisted,
      delisted_at: store.delisted_at ?? null,
      approval_status: store.approval_status,
      is_active: store.is_active,
      is_accepting_orders: store.is_accepting_orders,
      is_available: store.is_available,
      today_date: schedule.todayDate || todayDate,
      today_slots: schedule.todaySlots.length > 0 ? schedule.todaySlots : todaySlots,
      configured_today_slots: schedule.configuredTodaySlots,
      active_slot: displaySlot,
      schedule_phase: schedule.schedulePhase,
      schedule_status_label: schedulePhaseLabel(schedule.schedulePhase),
      within_operating_hours: withinHours,
      close_reason: closeReason,
      manual_close_until: manualCloseUntil,
      next_open_iso: isDelisted ? null : nextOpenIso,
      last_toggled_at: lastToggledAt,
      last_toggled_by_email: lastToggledByEmail,
      last_toggled_by_name: lastToggledByName,
      last_toggled_by_id: lastToggledById,
      last_toggle_type: lastToggleType,
      restriction_type: restrictionTypeOut,
      unavailable_reason: unavailableReason,
      within_hours_but_restricted: isDelisted ? false : withinHoursButRestricted,
      block_auto_open: blockAutoOpen,
      is_today_scheduled_closed: schedule.isTodayScheduledClosed,
      opens_at: isDelisted ? null : opensAtOut,
      next_schedule_transition_at: isDelisted ? null : nextScheduleTransitionAt,
      countdown_at: isDelisted ? null : scheduleCountdown.at,
      countdown_kind: isDelisted ? null : scheduleCountdown.kind,
      countdown_wall_label: isDelisted ? null : scheduleCountdown.wallLabel,
      scheduled_time_offs: scheduledTimeOffs,
      active_rush: activeRush,
      schedule_end_prompt_active: scheduleEndPromptActive,
      schedule_end_prompt_expires_at: scheduleEndPromptExpiresAt,
      is_manual_override: av["is_manual_override"] === true,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/store-operations]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/merchant/stores/[id]/store-operations
 * Body: { action: 'manual_open' | 'manual_close' | 'update_manual_lock', closure_type?, close_reason?, closure_date?, closure_time?, block_auto_open? }
 * Updates `merchant_stores` and `merchant_store_availability` (aligned with app / Partner Site).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });
    }
    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    if (!action || !["manual_open", "manual_close", "update_manual_lock"].includes(action)) {
      return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }

    const approval = String(store.approval_status || "").toUpperCase();
    const isDelisted = isStoreDelisted(store);
    if (isDelisted && action === "manual_open") {
      return NextResponse.json(
        {
          success: false,
          error: "Delisted store cannot be opened. Relist the store from admin first.",
          code: "STORE_DELISTED",
        },
        { status: 400 }
      );
    }
    const systemUser = await getSystemUserByEmail(user.email);
    const agentId = systemUser?.id ?? null;

    const sql = getSql();
    const togglerEmail = user.email ?? "unknown";

    if (action === "manual_open") {
      const storeTz = DEFAULT_STORE_TIMEZONE;

      const operatingOpenRows = await sql`
        SELECT is_24_hours, closed_days, same_for_all_days,
               monday_open, monday_slot1_start, monday_slot1_end, monday_slot2_start, monday_slot2_end,
               tuesday_open, tuesday_slot1_start, tuesday_slot1_end, tuesday_slot2_start, tuesday_slot2_end,
               wednesday_open, wednesday_slot1_start, wednesday_slot1_end, wednesday_slot2_start, wednesday_slot2_end,
               thursday_open, thursday_slot1_start, thursday_slot1_end, thursday_slot2_start, thursday_slot2_end,
               friday_open, friday_slot1_start, friday_slot1_end, friday_slot2_start, friday_slot2_end,
               saturday_open, saturday_slot1_start, saturday_slot1_end, saturday_slot2_start, saturday_slot2_end,
               sunday_open, sunday_slot1_start, sunday_slot1_end, sunday_slot2_start, sunday_slot2_end
        FROM merchant_store_operating_hours WHERE store_id = ${storeId} LIMIT 1
      `;
      const ohOpen = (Array.isArray(operatingOpenRows) ? operatingOpenRows[0] : operatingOpenRows) as
        | Record<string, unknown>
        | undefined;
      if (ohOpen) {
        const openSchedule = evaluateStoreSchedule(ohOpen, storeTz);
        if (openSchedule.isTodayScheduledClosed) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Cannot open: today is marked as a scheduled off day in Outlet Timings. Update Outlet Timings to mark today as open.",
              code: "SCHEDULED_OFF_DAY",
            },
            { status: 400 }
          );
        }
      }

      const availBefore = await sql`
        SELECT manual_close_until, restriction_type FROM merchant_store_availability WHERE store_id = ${storeId} LIMIT 1
      `;
      const availBeforeRow = Array.isArray(availBefore) ? availBefore[0] : availBefore;
      const hadScheduledClosure =
        availBeforeRow?.manual_close_until != null && String(availBeforeRow.manual_close_until).trim() !== "";

      if (hadScheduledClosure) {
        const todayStr = new Date().toISOString().slice(0, 10);
        await sql`
          DELETE FROM merchant_store_holidays
          WHERE store_id = ${storeId} AND holiday_date >= ${todayStr}::date
        `;
      }

      await sql`
        UPDATE merchant_store_scheduled_closures
        SET status = 'completed', updated_at = NOW()
        WHERE store_id = ${storeId} AND status IN ('scheduled', 'active')
      `;

      const updated = await updateMerchantStore(storeId, areaManagerId, {
        operational_status: "OPEN",
        is_active: true,
        is_accepting_orders: true,
        is_available: true,
      });
      if (!updated) {
        return NextResponse.json({ success: false, error: "Failed to update store" }, { status: 500 });
      }

      let manualOverrideOutsideSchedule = false;
      if (ohOpen) {
        const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz(storeTz);
        const openSchedule = evaluateStoreSchedule(ohOpen, storeTz);
        const beforeFirst = isBeforeFirstSlotToday(openSchedule, openSchedule.minutesSinceMidnight);
        manualOverrideOutsideSchedule =
          !isWithinOperatingHours(ohOpen, dayOfWeek, minutesSinceMidnight) && !beforeFirst;
      }

      const logRestrictionBefore =
        availBeforeRow?.restriction_type != null ? String(availBeforeRow.restriction_type) : null;
      const manualOverrideAt = manualOverrideOutsideSchedule ? new Date() : null;

      await sql`
        INSERT INTO merchant_store_availability (
          store_id, is_available, is_accepting_orders, unavailable_reason, close_reason,
          manual_close_until, restriction_type, block_auto_open, is_manual_override, manual_override_at,
          schedule_end_prompt_expires_at, schedule_end_prompted_at,
          last_toggle_type, last_toggled_at, last_toggled_by_email, updated_at
        ) VALUES (
          ${storeId}, TRUE, TRUE, NULL, NULL, NULL, NULL, FALSE,
          ${manualOverrideOutsideSchedule}, ${manualOverrideAt},
          NULL, NULL,
          'MANUAL_OPEN', NOW(), ${togglerEmail}, NOW()
        )
        ON CONFLICT (store_id) DO UPDATE SET
          is_available = TRUE,
          is_accepting_orders = TRUE,
          unavailable_reason = NULL,
          close_reason = NULL,
          manual_close_until = NULL,
          restriction_type = NULL,
          block_auto_open = FALSE,
          is_manual_override = ${manualOverrideOutsideSchedule},
          manual_override_at = ${manualOverrideAt},
          schedule_end_prompt_expires_at = NULL,
          schedule_end_prompted_at = NULL,
          last_toggle_type = 'MANUAL_OPEN',
          last_toggled_at = NOW(),
          last_toggled_by_email = ${togglerEmail},
          updated_at = NOW()
      `;

      await sql`
        INSERT INTO merchant_store_status_log (store_id, action, restriction_type, close_reason, performed_by_email)
        VALUES (${storeId}, 'manual_open', ${logRestrictionBefore}, NULL, ${togglerEmail})
      `;

      await triggerStoreScheduleTick(storeId);
    } else if (action === "manual_close") {
      const updated = await updateMerchantStore(storeId, areaManagerId, {
        operational_status: "CLOSED",
        is_active: false,
        is_accepting_orders: false,
        is_available: false,
      });
      if (!updated) {
        return NextResponse.json({ success: false, error: "Failed to update store" }, { status: 500 });
      }
      const bodyObj = body as Record<string, unknown>;
      const operatingCloseRows = await sql`
        SELECT is_24_hours, closed_days, same_for_all_days,
               monday_open, monday_slot1_start, monday_slot1_end, monday_slot2_start, monday_slot2_end,
               tuesday_open, tuesday_slot1_start, tuesday_slot1_end, tuesday_slot2_start, tuesday_slot2_end,
               wednesday_open, wednesday_slot1_start, wednesday_slot1_end, wednesday_slot2_start, wednesday_slot2_end,
               thursday_open, thursday_slot1_start, thursday_slot1_end, thursday_slot2_start, thursday_slot2_end,
               friday_open, friday_slot1_start, friday_slot1_end, friday_slot2_start, friday_slot2_end,
               saturday_open, saturday_slot1_start, saturday_slot1_end, saturday_slot2_start, saturday_slot2_end,
               sunday_open, sunday_slot1_start, sunday_slot1_end, sunday_slot2_start, sunday_slot2_end
        FROM merchant_store_operating_hours
        WHERE store_id = ${storeId}
        LIMIT 1
      `;
      const operatingClose = Array.isArray(operatingCloseRows) ? operatingCloseRows[0] : operatingCloseRows;
      const ohForClose = (operatingClose ?? null) as Record<string, unknown> | null;
      const manualUntilIso = computeManualCloseUntilIso(bodyObj, ohForClose);
      const reasonRaw = typeof bodyObj.close_reason === "string" ? bodyObj.close_reason.trim() : "";
      const closeReasonText =
        reasonRaw !== ""
          ? reasonRaw
          : manualUntilIso
            ? "Temporarily closed"
            : "Closed until manually reopened";
      const unavailReason = manualUntilIso ? "manual_close" : "manual_indefinite";
      const closureTypeStr = String(bodyObj.closure_type || "");
      const restrictionForDb = closureTypeStr === "manual_hold" ? "manual_hold" : "manual";
      const blockAutoOpenForManualHold = closureTypeStr === "manual_hold";
      const availBeforeClose = await sql`
        SELECT restriction_type FROM merchant_store_availability WHERE store_id = ${storeId} LIMIT 1
      `;
      const availBeforeCloseRow = Array.isArray(availBeforeClose) ? availBeforeClose[0] : availBeforeClose;
      const logRestrictionBefore =
        availBeforeCloseRow?.restriction_type != null ? String(availBeforeCloseRow.restriction_type) : null;

      await sql`
        INSERT INTO merchant_store_availability (
          store_id, is_available, is_accepting_orders, unavailable_reason, close_reason,
          manual_close_until, restriction_type, block_auto_open, is_manual_override, manual_override_at,
          schedule_end_prompt_expires_at, schedule_end_prompted_at,
          last_toggle_type, last_toggled_at, last_toggled_by_email, updated_at
        ) VALUES (
          ${storeId}, FALSE, FALSE, ${unavailReason}, ${closeReasonText}, ${manualUntilIso}, ${restrictionForDb}, ${blockAutoOpenForManualHold},
          FALSE, NULL, NULL, NULL,
          'MANUAL_CLOSE', NOW(), ${togglerEmail}, NOW()
        )
        ON CONFLICT (store_id) DO UPDATE SET
          is_available = FALSE,
          is_accepting_orders = FALSE,
          unavailable_reason = EXCLUDED.unavailable_reason,
          close_reason = EXCLUDED.close_reason,
          manual_close_until = EXCLUDED.manual_close_until,
          restriction_type = EXCLUDED.restriction_type,
          block_auto_open = EXCLUDED.block_auto_open,
          is_manual_override = FALSE,
          manual_override_at = NULL,
          schedule_end_prompt_expires_at = NULL,
          schedule_end_prompted_at = NULL,
          last_toggle_type = EXCLUDED.last_toggle_type,
          last_toggled_at = EXCLUDED.last_toggled_at,
          last_toggled_by_email = EXCLUDED.last_toggled_by_email,
          updated_at = NOW()
      `;

      await sql`
        INSERT INTO merchant_store_status_log (store_id, action, restriction_type, close_reason, performed_by_email)
        VALUES (${storeId}, 'manual_close', ${logRestrictionBefore}, ${closeReasonText}, ${togglerEmail})
      `;

      // Sync live columns; schedule engine must keep the store CLOSED while manual hold is active.
      await triggerStoreScheduleTick(storeId);

      try {
        await insertActivityLog({
          storeId,
          agentId,
          changedSection: "store_operations",
          fieldName: "operational_status",
          oldValue: store.operational_status ?? null,
          newValue: action,
          changeReason: body?.close_reason ?? body?.change_reason ?? null,
          actionType: "update",
        });
      } catch (logErr) {
        console.warn("[POST store-operations] activity log insert failed:", logErr);
      }

      return NextResponse.json({
        success: true,
        operational_status: "CLOSED",
        surface_online: false,
        is_open: false,
        manual_close_until: manualUntilIso,
        block_auto_open: blockAutoOpenForManualHold,
      });
    } else if (action === "update_manual_lock") {
      const block = body?.block_auto_open === true;
      await sql`
        INSERT INTO merchant_store_availability (store_id, block_auto_open, updated_at)
        VALUES (${storeId}, ${block}, NOW())
        ON CONFLICT (store_id) DO UPDATE SET
          block_auto_open = EXCLUDED.block_auto_open,
          updated_at = NOW()
      `;
    }

    try {
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "store_operations",
        fieldName: "operational_status",
        oldValue: store.operational_status ?? null,
        newValue: action,
        changeReason: body?.close_reason ?? body?.change_reason ?? null,
        actionType: "update",
      });
    } catch (logErr) {
      console.warn("[POST store-operations] activity log insert failed:", logErr);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/store-operations]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
