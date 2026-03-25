/**
 * GET /api/merchant/stores/[id]/store-operations
 * Returns store open/closed status and operating info (for Store overview).
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { insertActivityLog } from "@/lib/db/operations/merchant-portal-activity-logs";
import { getSql } from "@/lib/db/client";

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
      SELECT is_24_hours, closed_days,
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
      last_toggled_at: null,
      last_toggled_by_name: null,
      last_toggled_by_id: null,
      last_toggle_type: null,
      restriction_type: null,
      within_hours_but_restricted: false,
      block_auto_open: false,
      is_today_scheduled_closed: isTodayScheduledClosed,
      opens_at: null,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/store-operations]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/merchant/stores/[id]/store-operations
 * Body: { action: 'manual_open' | 'manual_close' | 'update_manual_lock', closure_type?, close_reason?, closure_date?, closure_time?, block_auto_open? }
 * Stub: returns success until merchant_store_availability / operations are wired.
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
    // TODO: persist to merchant_store_availability / status log when wired
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/store-operations]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
