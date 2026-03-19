/**
 * GET /api/merchant/stores/[id]/operating-hours
 * Returns operating hours from merchant_store_operating_hours (one row per store).
 *
 * PATCH /api/merchant/stores/[id]/operating-hours
 * Body: same_for_all_days?, is_24_hours?, closed_days?, and per-day: {day}_open, {day}_slot1_start, {day}_slot1_end, {day}_slot2_start?, {day}_slot2_end?
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { insertActivityLog } from "@/lib/db/operations/merchant-portal-activity-logs";

export const runtime = "nodejs";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

async function getAreaManagerId(userId: string, email: string) {
  if (await isSuperAdmin(userId, email)) return null;
  const systemUser = await getSystemUserByEmail(email);
  if (!systemUser) return null;
  const am = await getAreaManagerByUserId(systemUser.id);
  return am?.id ?? null;
}

/** Return "HH:mm" for API response (UI expects 5 chars). Postgres may return "HH:mm:ss". */
function serializeTime(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    return /^\d{1,2}:\d{2}(:\d{2})?$/.test(s) ? s.slice(0, 5) : null;
  }
  if (v instanceof Date) return v.toTimeString().slice(0, 5);
  return null;
}

/** Normalize to "HH:mm" or null; empty string → null. */
function parseTimeInput(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim().slice(0, 5);
    return /^\d{1,2}:\d{2}$/.test(s) ? s : null;
  }
  if (v instanceof Date) return v.toTimeString().slice(0, 5);
  return null;
}

/** For DB time column: "HH:mm" → "HH:mm:00", null stays null. Postgres time accepts HH:mm:ss. */
function toTimeValue(s: string | null): string | null {
  if (s == null || s === "") return null;
  const trimmed = String(s).trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  return null;
}

/** Compare time strings "HH:MM"; returns true if end > start. */
function timeGt(end: string | null, start: string | null): boolean {
  if (end == null || start == null) return false;
  const [eh, em] = end.split(":").map(Number);
  const [sh, sm] = start.split(":").map(Number);
  return eh > sh || (eh === sh && em > sm);
}

/** Build human-readable diff for activity log: only changed fields with previous → updated. */
function operatingHoursDiff(
  oldRow: Record<string, unknown> | null,
  newPayload: Record<string, unknown>
): { oldValue: string; newValue: string } | null {
  const keys = [
    "same_for_all_days",
    "is_24_hours",
    "closed_days",
    ...DAYS.flatMap((d) => [
      `${d}_open`,
      `${d}_slot1_start`,
      `${d}_slot1_end`,
      `${d}_slot2_start`,
      `${d}_slot2_end`,
    ]),
  ];
  const norm = (v: unknown, k: string): string => {
    if (v == null) return "null";
    if (Array.isArray(v)) return JSON.stringify(v);
    const s = String(v);
    if (/_(slot1_start|slot1_end|slot2_start|slot2_end)$/.test(k) && /^\d{1,2}:\d{2}(:\d{2})?$/.test(s))
      return s.slice(0, 5);
    return s;
  };
  const oldParts: string[] = [];
  const newParts: string[] = [];
  for (const k of keys) {
    const oldStr = norm(oldRow?.[k], k);
    const newStr = norm(newPayload[k], k);
    if (oldStr !== newStr) {
      oldParts.push(`${k}: ${oldStr}`);
      newParts.push(`${k}: ${newStr}`);
    }
  }
  if (oldParts.length === 0) return null;
  return { oldValue: oldParts.join("; "), newValue: newParts.join("; ") };
}

/** Normalize day values so DB check constraints (slot_order, slot_overlap, slot_pair) pass. Keeps slot values for closed days. */
function normalizeDayValues(
  dayValues: { open: boolean; s1Start: string | null; s1End: string | null; s2Start: string | null; s2End: string | null }[]
): void {
  for (const d of dayValues) {
    d.s1Start = parseTimeInput(d.s1Start);
    d.s1End = parseTimeInput(d.s1End);
    d.s2Start = parseTimeInput(d.s2Start);
    d.s2End = parseTimeInput(d.s2End);
    if (d.s1Start != null && d.s1End != null && !timeGt(d.s1End, d.s1Start)) {
      d.s1Start = d.s1End = null;
    }
    if (d.s2Start != null && d.s2End != null) {
      if (d.s1End != null && !timeGt(d.s2Start, d.s1End)) {
        d.s2Start = d.s2End = null;
      } else if (d.s1Start != null && !timeGt(d.s2End, d.s1Start)) {
        d.s2Start = d.s2End = null;
      }
    } else if (d.s2Start != null || d.s2End != null) {
      d.s2Start = d.s2End = null;
    }
  }
}

export async function GET(
  _request: NextRequest,
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
    const areaManagerId = await getAreaManagerId(user.id, user.email);
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }
    const sql = getSql();
    const rows = await sql`
      SELECT store_id,
             monday_open, monday_slot1_start, monday_slot1_end, monday_slot2_start, monday_slot2_end, monday_total_duration_minutes,
             tuesday_open, tuesday_slot1_start, tuesday_slot1_end, tuesday_slot2_start, tuesday_slot2_end, tuesday_total_duration_minutes,
             wednesday_open, wednesday_slot1_start, wednesday_slot1_end, wednesday_slot2_start, wednesday_slot2_end, wednesday_total_duration_minutes,
             thursday_open, thursday_slot1_start, thursday_slot1_end, thursday_slot2_start, thursday_slot2_end, thursday_total_duration_minutes,
             friday_open, friday_slot1_start, friday_slot1_end, friday_slot2_start, friday_slot2_end, friday_total_duration_minutes,
             saturday_open, saturday_slot1_start, saturday_slot1_end, saturday_slot2_start, saturday_slot2_end, saturday_total_duration_minutes,
             sunday_open, sunday_slot1_start, sunday_slot1_end, sunday_slot2_start, sunday_slot2_end, sunday_total_duration_minutes,
             is_24_hours, same_for_all_days, closed_days, updated_at
      FROM merchant_store_operating_hours
      WHERE store_id = ${storeId}
      LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) {
      return NextResponse.json({
        success: true,
        same_for_all_days: false,
        is_24_hours: false,
        closed_days: [],
        ...DAYS.reduce((acc, day) => {
          acc[`${day}_open`] = false;
          acc[`${day}_slot1_start`] = null;
          acc[`${day}_slot1_end`] = null;
          acc[`${day}_slot2_start`] = null;
          acc[`${day}_slot2_end`] = null;
          acc[`${day}_total_duration_minutes`] = 0;
          return acc;
        }, {} as Record<string, unknown>),
      });
    }
    const o = row as Record<string, unknown>;
    const out: Record<string, unknown> = {
      same_for_all_days: !!o.same_for_all_days,
      is_24_hours: !!o.is_24_hours,
      closed_days: Array.isArray(o.closed_days) ? o.closed_days : [],
    };
    for (const day of DAYS) {
      out[`${day}_open`] = !!o[`${day}_open`];
      out[`${day}_slot1_start`] = serializeTime(o[`${day}_slot1_start`]);
      out[`${day}_slot1_end`] = serializeTime(o[`${day}_slot1_end`]);
      out[`${day}_slot2_start`] = serializeTime(o[`${day}_slot2_start`]);
      out[`${day}_slot2_end`] = serializeTime(o[`${day}_slot2_end`]);
      out[`${day}_total_duration_minutes`] = Number(o[`${day}_total_duration_minutes`]) || 0;
    }
    if (o.updated_at) out.updated_at = o.updated_at instanceof Date ? o.updated_at.toISOString() : o.updated_at;
    return NextResponse.json({ success: true, ...out });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/operating-hours]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
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
    const areaManagerId = await getAreaManagerId(user.id, user.email);
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }
    const access = await getMerchantAccess(user.id, user.email);
    if (!access) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }
    if (!access.can_update_store_timing) {
      return NextResponse.json({ success: false, error: "Permission denied: cannot update store timing" }, { status: 403 });
    }
    const systemUser = await getSystemUserByEmail(user.email);
    const agentId = systemUser?.id ?? null;

    const body = await request.json().catch(() => ({}));
    const sql = getSql();
    const sameForAll = !!body.same_for_all_days;
    const is24Hours = !!body.is_24_hours;
    const closedDays = Array.isArray(body.closed_days) ? body.closed_days : [];
    const dayValues: { open: boolean; s1Start: string | null; s1End: string | null; s2Start: string | null; s2End: string | null }[] = [];
    for (const day of DAYS) {
      dayValues.push({
        open: !!body[`${day}_open`],
        s1Start: body[`${day}_slot1_start`] ?? null,
        s1End: body[`${day}_slot1_end`] ?? null,
        s2Start: body[`${day}_slot2_start`] ?? null,
        s2End: body[`${day}_slot2_end`] ?? null,
      });
    }
    normalizeDayValues(dayValues);

    const newPayload = {
      same_for_all_days: sameForAll,
      is_24_hours: is24Hours,
      closed_days: closedDays,
      ...DAYS.reduce((acc, day, i) => {
        acc[`${day}_open`] = dayValues[i].open;
        acc[`${day}_slot1_start`] = dayValues[i].s1Start;
        acc[`${day}_slot1_end`] = dayValues[i].s1End;
        acc[`${day}_slot2_start`] = dayValues[i].s2Start;
        acc[`${day}_slot2_end`] = dayValues[i].s2End;
        return acc;
      }, {} as Record<string, unknown>),
    };

    let oldRow: Record<string, unknown> | null = null;
    const existing = await sql`
      SELECT same_for_all_days, is_24_hours, closed_days,
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
    const existingRow = Array.isArray(existing) ? existing[0] : existing;
    if (existingRow) {
      const o = existingRow as Record<string, unknown>;
      oldRow = {
        same_for_all_days: !!o.same_for_all_days,
        is_24_hours: !!o.is_24_hours,
        closed_days: Array.isArray(o.closed_days) ? o.closed_days : [],
      };
      for (const day of DAYS) {
        oldRow[`${day}_open`] = !!o[`${day}_open`];
        oldRow[`${day}_slot1_start`] = serializeTime(o[`${day}_slot1_start`]);
        oldRow[`${day}_slot1_end`] = serializeTime(o[`${day}_slot1_end`]);
        oldRow[`${day}_slot2_start`] = serializeTime(o[`${day}_slot2_start`]);
        oldRow[`${day}_slot2_end`] = serializeTime(o[`${day}_slot2_end`]);
      }
    }

    const toDb = (t: string | null) => toTimeValue(t);
    await sql`
      INSERT INTO merchant_store_operating_hours (store_id, same_for_all_days, is_24_hours, closed_days,
        monday_open, monday_slot1_start, monday_slot1_end, monday_slot2_start, monday_slot2_end,
        tuesday_open, tuesday_slot1_start, tuesday_slot1_end, tuesday_slot2_start, tuesday_slot2_end,
        wednesday_open, wednesday_slot1_start, wednesday_slot1_end, wednesday_slot2_start, wednesday_slot2_end,
        thursday_open, thursday_slot1_start, thursday_slot1_end, thursday_slot2_start, thursday_slot2_end,
        friday_open, friday_slot1_start, friday_slot1_end, friday_slot2_start, friday_slot2_end,
        saturday_open, saturday_slot1_start, saturday_slot1_end, saturday_slot2_start, saturday_slot2_end,
        sunday_open, sunday_slot1_start, sunday_slot1_end, sunday_slot2_start, sunday_slot2_end)
      VALUES (${storeId}, ${sameForAll}, ${is24Hours}, ${closedDays.length ? closedDays : null},
        ${dayValues[0].open}, ${toDb(dayValues[0].s1Start)}, ${toDb(dayValues[0].s1End)}, ${toDb(dayValues[0].s2Start)}, ${toDb(dayValues[0].s2End)},
        ${dayValues[1].open}, ${toDb(dayValues[1].s1Start)}, ${toDb(dayValues[1].s1End)}, ${toDb(dayValues[1].s2Start)}, ${toDb(dayValues[1].s2End)},
        ${dayValues[2].open}, ${toDb(dayValues[2].s1Start)}, ${toDb(dayValues[2].s1End)}, ${toDb(dayValues[2].s2Start)}, ${toDb(dayValues[2].s2End)},
        ${dayValues[3].open}, ${toDb(dayValues[3].s1Start)}, ${toDb(dayValues[3].s1End)}, ${toDb(dayValues[3].s2Start)}, ${toDb(dayValues[3].s2End)},
        ${dayValues[4].open}, ${toDb(dayValues[4].s1Start)}, ${toDb(dayValues[4].s1End)}, ${toDb(dayValues[4].s2Start)}, ${toDb(dayValues[4].s2End)},
        ${dayValues[5].open}, ${toDb(dayValues[5].s1Start)}, ${toDb(dayValues[5].s1End)}, ${toDb(dayValues[5].s2Start)}, ${toDb(dayValues[5].s2End)},
        ${dayValues[6].open}, ${toDb(dayValues[6].s1Start)}, ${toDb(dayValues[6].s1End)}, ${toDb(dayValues[6].s2Start)}, ${toDb(dayValues[6].s2End)})
      ON CONFLICT (store_id) DO UPDATE SET
        same_for_all_days = EXCLUDED.same_for_all_days,
        is_24_hours = EXCLUDED.is_24_hours,
        closed_days = EXCLUDED.closed_days,
        monday_open = EXCLUDED.monday_open, monday_slot1_start = EXCLUDED.monday_slot1_start, monday_slot1_end = EXCLUDED.monday_slot1_end, monday_slot2_start = EXCLUDED.monday_slot2_start, monday_slot2_end = EXCLUDED.monday_slot2_end,
        tuesday_open = EXCLUDED.tuesday_open, tuesday_slot1_start = EXCLUDED.tuesday_slot1_start, tuesday_slot1_end = EXCLUDED.tuesday_slot1_end, tuesday_slot2_start = EXCLUDED.tuesday_slot2_start, tuesday_slot2_end = EXCLUDED.tuesday_slot2_end,
        wednesday_open = EXCLUDED.wednesday_open, wednesday_slot1_start = EXCLUDED.wednesday_slot1_start, wednesday_slot1_end = EXCLUDED.wednesday_slot1_end, wednesday_slot2_start = EXCLUDED.wednesday_slot2_start, wednesday_slot2_end = EXCLUDED.wednesday_slot2_end,
        thursday_open = EXCLUDED.thursday_open, thursday_slot1_start = EXCLUDED.thursday_slot1_start, thursday_slot1_end = EXCLUDED.thursday_slot1_end, thursday_slot2_start = EXCLUDED.thursday_slot2_start, thursday_slot2_end = EXCLUDED.thursday_slot2_end,
        friday_open = EXCLUDED.friday_open, friday_slot1_start = EXCLUDED.friday_slot1_start, friday_slot1_end = EXCLUDED.friday_slot1_end, friday_slot2_start = EXCLUDED.friday_slot2_start, friday_slot2_end = EXCLUDED.friday_slot2_end,
        saturday_open = EXCLUDED.saturday_open, saturday_slot1_start = EXCLUDED.saturday_slot1_start, saturday_slot1_end = EXCLUDED.saturday_slot1_end, saturday_slot2_start = EXCLUDED.saturday_slot2_start, saturday_slot2_end = EXCLUDED.saturday_slot2_end,
        sunday_open = EXCLUDED.sunday_open, sunday_slot1_start = EXCLUDED.sunday_slot1_start, sunday_slot1_end = EXCLUDED.sunday_slot1_end, sunday_slot2_start = EXCLUDED.sunday_slot2_start, sunday_slot2_end = EXCLUDED.sunday_slot2_end,
        updated_at = NOW()
    `;

    try {
      const diff = operatingHoursDiff(oldRow ?? {}, newPayload);
      if (diff) {
        await insertActivityLog({
          storeId,
          agentId,
          changedSection: "outlet_timings",
          fieldName: "operating_hours",
          oldValue: diff.oldValue,
          newValue: diff.newValue,
          actionType: "update",
        });
      }
    } catch (logErr) {
      console.warn("[PATCH operating-hours] activity log insert failed:", logErr);
    }
    await logActionByAuth(user.id, user.email, "MERCHANT", "UPDATE", {
      resourceType: "OPERATING_HOURS",
      resourceId: String(storeId),
      actionDetails: { storeId },
      previousValues: oldRow ?? undefined,
      newValues: newPayload,
      ipAddress: getIpAddress(request),
      userAgent: getUserAgent(request),
      requestPath: `/api/merchant/stores/${storeId}/operating-hours`,
      requestMethod: "PATCH",
    });
    // Notify backend to re-run schedule engine for this store (store timing is managed by backend).
    const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
    const scheduleTickSecret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
    if (
      backendUrl &&
      scheduleTickSecret &&
      typeof backendUrl === "string" &&
      typeof scheduleTickSecret === "string"
    ) {
      const base = backendUrl.replace(/\/+$/, "");
      fetch(`${base}/v1/internal/stores/${storeId}/schedule-tick`, {
        method: "POST",
        headers: { "X-Internal-Secret": scheduleTickSecret },
      }).catch((err) => {
        console.warn("[PATCH operating-hours] backend schedule-tick request failed:", err);
      });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[PATCH /api/merchant/stores/[id]/operating-hours]", e);
    return NextResponse.json(
      { success: false, error: process.env.NODE_ENV === "development" ? message : "Internal error" },
      { status: 500 }
    );
  }
}
