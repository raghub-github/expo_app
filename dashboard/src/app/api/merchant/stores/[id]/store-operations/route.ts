/**
 * GET /api/merchant/stores/[id]/store-operations
 * Returns store open/closed status and operating info (for Store overview).
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById, updateMerchantStore } from "@/lib/db/operations/merchant-stores";
import { insertActivityLog } from "@/lib/db/operations/merchant-portal-activity-logs";
import { getSql } from "@/lib/db/client";
import {
  getNextOpenDayStartIso,
  getNextOpenIso,
  getNextOpenIsoAfterIstCalendarDay,
  isLikelyLegacyEndOfDayIstClose,
  isWithinOperatingHours,
  nowInStoreTz,
} from "@/lib/merchantStoreNextOpenIso";

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
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });
    }
    let areaManagerId: number | null = null;
    if (!(await isSuperAdmin(user.id, user.email))) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    // Derive effective operational status from DB row.
    // A store is only truly OPEN when:
    // - approval_status = APPROVED
    // - is_active, is_accepting_orders and is_available are true
    // - operational_status is OPEN
    // - store is not deleted or delisted
    const approval = String(store.approval_status || "").toUpperCase();
    const rawOperational = String(store.operational_status || "CLOSED").toUpperCase();
    const isDelisted = approval === "DELISTED";
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
    const operatingRows = await sql`
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

    const availRows = await sql`
      SELECT manual_close_until, block_auto_open, close_reason, restriction_type, unavailable_reason,
             last_toggled_at, last_toggled_by_email, last_toggled_by_name, last_toggled_by_id, last_toggle_type
      FROM merchant_store_availability
      WHERE store_id = ${storeId}
      LIMIT 1
    `;
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
    const restrictionTypeOut = av.restriction_type != null ? String(av.restriction_type) : null;
    const unavailableReason = av.unavailable_reason != null ? String(av.unavailable_reason) : null;

    const ohRecord = (operating ?? null) as Record<string, unknown> | null;
    const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz();
    const withinHours = ohRecord ? isWithinOperatingHours(ohRecord, dayOfWeek, minutesSinceMidnight) : false;
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

    return NextResponse.json({
      success: true,
      operational_status: effectiveOperationalStatus,
      is_delisted: isDelisted,
      approval_status: store.approval_status,
      is_active: store.is_active,
      is_accepting_orders: store.is_accepting_orders,
      is_available: store.is_available,
      today_date: todayDate,
      today_slots: todaySlots,
      close_reason: closeReason,
      manual_close_until: manualCloseUntil,
      next_open_iso: nextOpenIso,
      last_toggled_at: lastToggledAt,
      last_toggled_by_email: lastToggledByEmail,
      last_toggled_by_name: lastToggledByName,
      last_toggled_by_id: lastToggledById,
      last_toggle_type: lastToggleType,
      restriction_type: restrictionTypeOut,
      unavailable_reason: unavailableReason,
      within_hours_but_restricted: withinHoursButRestricted,
      block_auto_open: blockAutoOpen,
      is_today_scheduled_closed: isTodayScheduledClosed,
      opens_at: opensAt,
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
    let areaManagerId: number | null = null;
    if (!(await isSuperAdmin(user.id, user.email))) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }
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
    const isDelisted = approval === "DELISTED";
    if (isDelisted && action === "manual_open") {
      return NextResponse.json(
        { success: false, error: "Delisted store cannot be opened. Relist the store from admin first." },
        { status: 400 }
      );
    }
    const systemUser = await getSystemUserByEmail(user.email);
    const agentId = systemUser?.id ?? null;

    const sql = getSql();
    const togglerEmail = user.email ?? "unknown";

    if (action === "manual_open") {
      const updated = await updateMerchantStore(storeId, areaManagerId, {
        operational_status: "OPEN",
        is_active: true,
        is_accepting_orders: true,
        is_available: true,
      });
      if (!updated) {
        return NextResponse.json({ success: false, error: "Failed to update store" }, { status: 500 });
      }
      await sql`
        INSERT INTO merchant_store_availability (
          store_id, is_available, is_accepting_orders, unavailable_reason, close_reason,
          manual_close_until, restriction_type, block_auto_open,
          last_toggle_type, last_toggled_at, last_toggled_by_email, updated_at
        ) VALUES (
          ${storeId}, TRUE, TRUE, NULL, NULL, NULL, NULL, FALSE, 'MANUAL_OPEN', NOW(), ${togglerEmail}, NOW()
        )
        ON CONFLICT (store_id) DO UPDATE SET
          is_available = TRUE,
          is_accepting_orders = TRUE,
          unavailable_reason = NULL,
          close_reason = NULL,
          manual_close_until = NULL,
          restriction_type = NULL,
          block_auto_open = FALSE,
          last_toggle_type = 'MANUAL_OPEN',
          last_toggled_at = NOW(),
          last_toggled_by_email = ${togglerEmail},
          updated_at = NOW()
      `;
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
      await sql`
        INSERT INTO merchant_store_availability (
          store_id, is_available, is_accepting_orders, unavailable_reason, close_reason,
          manual_close_until, restriction_type, block_auto_open,
          last_toggle_type, last_toggled_at, last_toggled_by_email, updated_at
        ) VALUES (
          ${storeId}, FALSE, FALSE, ${unavailReason}, ${closeReasonText}, ${manualUntilIso}, ${restrictionForDb}, ${blockAutoOpenForManualHold},
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
          last_toggle_type = EXCLUDED.last_toggle_type,
          last_toggled_at = EXCLUDED.last_toggled_at,
          last_toggled_by_email = EXCLUDED.last_toggled_by_email,
          updated_at = NOW()
      `;
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
