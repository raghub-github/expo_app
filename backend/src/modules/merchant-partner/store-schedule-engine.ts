/**
 * Store Auto Schedule Engine
 * Runs on a fixed interval (e.g. every 30s) and on cold start.
 * When Auto-open from schedule = ON:
 *   - OPEN store when current time (store TZ) is within operating hours
 *   - CLOSE store when current time is outside operating hours
 * Respects: manual_lock (block_auto_open), manual_close_until, scheduled closures.
 * All options: toggle open/close, closed for today, temp closed, manual open, scheduled off.
 *
 * Source of truth: This module and merchant-partner routes own all store timing and
 * availability logic. Tables: merchant_store_operating_hours (schedule), merchant_store_availability
 * (toggle, auto_open_from_schedule, block_auto_open, manual_close_until). Frontends (merchant app,
 * dashboard) must use backend APIs only; do not duplicate schedule or open/close logic in the frontend.
 */

import { getSql } from "../../db/client.js";

const STORE_TIMEZONE = "Asia/Kolkata";

/**
 * Keeps `merchant_stores` online flags and `operational_status` aligned whenever the store is
 * considered online vs offline — any path (merchant app PATCH, Partner Site, auto schedule).
 * Dashboard / Partner GET treat OPEN only when `operational_status` is OPEN and triple is true;
 * previously PATCH only flipped booleans, so the app looked online while portal stayed CLOSED.
 */
export async function syncMerchantStoresOnlineTriple(
  sql: ReturnType<typeof getSql>,
  storeId: number,
  online: boolean,
  opts?: { parentId?: number }
): Promise<void> {
  const parentId = opts?.parentId;
  if (parentId != null && Number.isInteger(parentId) && parentId >= 1) {
    await sql`
      UPDATE merchant_stores
      SET
        is_active = ${online},
        is_accepting_orders = ${online},
        is_available = ${online},
        operational_status = CASE
          WHEN ${online} THEN 'OPEN'::store_operational_status
          ELSE 'CLOSED'::store_operational_status
        END,
        updated_at = NOW()
      WHERE id = ${storeId} AND parent_id = ${parentId}
    `;
  } else {
    await sql`
      UPDATE merchant_stores
      SET
        is_active = ${online},
        is_accepting_orders = ${online},
        is_available = ${online},
        operational_status = CASE
          WHEN ${online} THEN 'OPEN'::store_operational_status
          ELSE 'CLOSED'::store_operational_status
        END,
        updated_at = NOW()
      WHERE id = ${storeId}
    `;
  }
}
const GRACE_BUFFER_SECONDS = 30;
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const SCHEDULE_END_PROMPT_GRACE_MS = 5 * 60 * 1000; // X minutes fallback → AUTO OFF

const UPDATED_BY_SYSTEM = "system";
const UPDATED_BY_ID_SYSTEM: number | null = null;

/** Emit store_status_changed: log and insert into merchant_store_status_change. */
export async function emitStoreStatusChanged(
  sql: ReturnType<typeof getSql>,
  storeId: number,
  previousStatus: "OPEN" | "CLOSED",
  newStatus: "OPEN" | "CLOSED",
  reason: string,
  triggerType: "AUTO" | "MANUAL" | "LOCK",
  log: { info: (o: object, msg?: string) => void }
): Promise<void> {
  const timestamp = new Date().toISOString();
  log.info(
    { store_id: storeId, previous_status: previousStatus, new_status: newStatus, reason, trigger_type: triggerType, timestamp },
    "store_status_changed"
  );
  try {
    await sql`
      INSERT INTO merchant_store_status_change (store_id, previous_status, new_status, reason, trigger_type)
      VALUES (${storeId}, ${previousStatus}, ${newStatus}, ${reason}, ${triggerType})
    `;
    // Realtime fanout: LISTEN/NOTIFY channel consumed by websocket hub (multi-instance safe).
    await sql`
      SELECT pg_notify(
        'store_status_changed',
        ${JSON.stringify({
          store_id: storeId,
          previous_status: previousStatus,
          new_status: newStatus,
          reason,
          trigger_type: triggerType,
          timestamp,
        })}
      )
    `;
  } catch (e) {
    log.info({ storeId, err: e }, "store_status_change_insert_failed");
  }
}

/** Ensure merchant_store_availability has a row for this store (insert default if missing). */
async function ensureAvailabilityRow(
  sql: ReturnType<typeof getSql>,
  storeId: number
): Promise<void> {
  await sql`
    INSERT INTO merchant_store_availability (
      store_id, is_available, is_accepting_orders,
      auto_open_from_schedule, block_auto_open, updated_at,
      updated_by, unavailable_reason, close_reason, last_toggle_type,
      is_manual_override, manual_override_at,
      schedule_end_prompted_at, schedule_end_prompt_expires_at,
      last_auto_action_at, auto_off_reason
    )
    VALUES (
      ${storeId},
      TRUE,
      TRUE,
      TRUE,
      FALSE,
      NOW(),
      ${UPDATED_BY_SYSTEM},
      NULL,
      NULL,
      NULL,
      FALSE,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL
    )
    ON CONFLICT (store_id) DO NOTHING
  `;
}

/** 1. Schedule closed – business hours ended. Atomic full metadata update. */
async function applyScheduleClosed(
  sql: ReturnType<typeof getSql>,
  storeId: number,
  log: { info: (o: object, msg?: string) => void }
): Promise<void> {
  const nowIso = new Date().toISOString();
  await sql`
    UPDATE merchant_store_availability
    SET
      is_available = FALSE,
      is_accepting_orders = FALSE,
      unavailable_reason = 'schedule_closed',
      close_reason = 'Scheduled hours ended',
      auto_unavailable_at = ${nowIso},
      auto_available_at = NULL,
      manual_close_until = NULL,
      is_manual_override = FALSE,
      manual_override_at = NULL,
      schedule_end_prompted_at = NULL,
      schedule_end_prompt_expires_at = NULL,
      auto_off_reason = NULL,
      last_toggle_type = 'AUTO_CLOSE',
      restriction_type = 'schedule',
      updated_by = ${UPDATED_BY_SYSTEM},
      updated_by_id = ${UPDATED_BY_ID_SYSTEM},
      last_toggled_at = ${nowIso},
      updated_at = NOW()
    WHERE store_id = ${storeId}
  `;
  await sql`
    INSERT INTO merchant_store_status_log (store_id, action, restriction_type, close_reason)
    VALUES (${storeId}, 'store_closed_auto', 'SCHEDULE', 'schedule_closed')
  `;
  log.info({ storeId, trigger: "schedule_closed" }, "store_auto_close");
  await emitStoreStatusChanged(sql, storeId, "OPEN", "CLOSED", "schedule_closed", "AUTO", log);
}

/** 2. Schedule open – business hours started. Atomic full metadata update. */
async function applyScheduleOpen(
  sql: ReturnType<typeof getSql>,
  storeId: number,
  log: { info: (o: object, msg?: string) => void }
): Promise<void> {
  const nowIso = new Date().toISOString();
  await sql`
    UPDATE merchant_store_availability
    SET
      is_available = TRUE,
      is_accepting_orders = TRUE,
      unavailable_reason = NULL,
      close_reason = NULL,
      auto_unavailable_at = NULL,
      auto_available_at = ${nowIso},
      manual_close_until = NULL,
      is_manual_override = FALSE,
      manual_override_at = NULL,
      schedule_end_prompted_at = NULL,
      schedule_end_prompt_expires_at = NULL,
      auto_off_reason = NULL,
      last_toggle_type = 'AUTO_OPEN',
      restriction_type = 'schedule',
      updated_by = ${UPDATED_BY_SYSTEM},
      updated_by_id = ${UPDATED_BY_ID_SYSTEM},
      last_toggled_at = ${nowIso},
      updated_at = NOW()
    WHERE store_id = ${storeId}
  `;
  await sql`
    INSERT INTO merchant_store_status_log (store_id, action, close_reason)
    VALUES (${storeId}, 'store_opened_auto', 'auto_open_triggered')
  `;
  log.info({ storeId, trigger: "schedule_open" }, "store_auto_open");
  await emitStoreStatusChanged(sql, storeId, "CLOSED", "OPEN", "schedule_open", "AUTO", log);
}

/** 5. Forced lock – manual activation lock. Atomic full metadata update. */
async function applyForcedLock(
  sql: ReturnType<typeof getSql>,
  storeId: number,
  log: { info: (o: object, msg?: string) => void }
): Promise<void> {
  const nowIso = new Date().toISOString();
  await sql`
    UPDATE merchant_store_availability
    SET
      is_available = FALSE,
      is_accepting_orders = FALSE,
      unavailable_reason = 'forced_lock',
      close_reason = 'Store locked manually',
      auto_unavailable_at = ${nowIso},
      auto_available_at = NULL,
      manual_close_until = NULL,
      is_manual_override = FALSE,
      manual_override_at = NULL,
      schedule_end_prompted_at = NULL,
      schedule_end_prompt_expires_at = NULL,
      auto_off_reason = 'forced_lock',
      last_auto_action_at = ${nowIso},
      last_toggle_type = 'LOCK_APPLIED',
      restriction_type = 'lock',
      updated_by = ${UPDATED_BY_SYSTEM},
      updated_by_id = ${UPDATED_BY_ID_SYSTEM},
      last_toggled_at = ${nowIso},
      updated_at = NOW()
    WHERE store_id = ${storeId}
  `;
  await sql`
    INSERT INTO merchant_store_status_log (store_id, action, restriction_type, close_reason)
    VALUES (${storeId}, 'store_closed_auto', 'MANUAL_LOCK', 'manual_lock')
  `;
  log.info({ storeId, trigger: "forced_lock" }, "store_manual_close");
  await emitStoreStatusChanged(sql, storeId, "OPEN", "CLOSED", "forced_lock", "LOCK", log);
}

/** Schedule expired (no hours config). Same as schedule closed. */
async function applyScheduleExpired(
  sql: ReturnType<typeof getSql>,
  storeId: number,
  log: { info: (o: object, msg?: string) => void }
): Promise<void> {
  const nowIso = new Date().toISOString();
  await sql`
    UPDATE merchant_store_availability
    SET
      is_available = FALSE,
      is_accepting_orders = FALSE,
      unavailable_reason = 'schedule_closed',
      close_reason = 'Scheduled hours ended',
      auto_unavailable_at = ${nowIso},
      auto_available_at = NULL,
      manual_close_until = NULL,
      is_manual_override = FALSE,
      manual_override_at = NULL,
      schedule_end_prompted_at = NULL,
      schedule_end_prompt_expires_at = NULL,
      auto_off_reason = 'schedule_expired',
      last_auto_action_at = ${nowIso},
      last_toggle_type = 'AUTO_CLOSE',
      restriction_type = 'schedule',
      updated_by = ${UPDATED_BY_SYSTEM},
      updated_by_id = ${UPDATED_BY_ID_SYSTEM},
      last_toggled_at = ${nowIso},
      updated_at = NOW()
    WHERE store_id = ${storeId}
  `;
  await sql`
    INSERT INTO merchant_store_status_log (store_id, action, restriction_type, close_reason)
    VALUES (${storeId}, 'store_closed_auto', 'SCHEDULE', 'schedule_expired')
  `;
  log.info({ storeId, reason: "schedule_expired" }, "store_auto_close");
  await emitStoreStatusChanged(sql, storeId, "OPEN", "CLOSED", "schedule_expired", "AUTO", log);
}

/** 7. Auto reopen after manual close expired. Atomic full metadata update. */
async function applyAutoReopen(
  sql: ReturnType<typeof getSql>,
  storeId: number,
  log: { info: (o: object, msg?: string) => void }
): Promise<void> {
  const nowIso = new Date().toISOString();
  await sql`
    UPDATE merchant_store_availability
    SET
      is_available = TRUE,
      is_accepting_orders = TRUE,
      unavailable_reason = NULL,
      close_reason = NULL,
      auto_unavailable_at = NULL,
      auto_available_at = ${nowIso},
      manual_close_until = NULL,
      is_manual_override = FALSE,
      manual_override_at = NULL,
      schedule_end_prompted_at = NULL,
      schedule_end_prompt_expires_at = NULL,
      auto_off_reason = NULL,
      last_toggle_type = 'AUTO_REOPEN',
      restriction_type = NULL,
      updated_by = ${UPDATED_BY_SYSTEM},
      updated_by_id = ${UPDATED_BY_ID_SYSTEM},
      last_toggled_at = ${nowIso},
      updated_at = NOW()
    WHERE store_id = ${storeId}
      AND (manual_close_until IS NULL OR manual_close_until < NOW())
  `;
  log.info({ storeId, trigger: "auto_reopen" }, "store_auto_open");
  await emitStoreStatusChanged(sql, storeId, "CLOSED", "OPEN", "auto_reopen", "AUTO", log);
}

async function applyScheduleEndPromptStart(
  sql: ReturnType<typeof getSql>,
  storeId: number,
  nowIso: string
): Promise<void> {
  const expiresAtIso = new Date(Date.now() + SCHEDULE_END_PROMPT_GRACE_MS).toISOString();
  await sql`
    UPDATE merchant_store_availability
    SET schedule_end_prompted_at = ${nowIso},
        schedule_end_prompt_expires_at = ${expiresAtIso},
        updated_by = ${UPDATED_BY_SYSTEM},
        updated_by_id = ${UPDATED_BY_ID_SYSTEM},
        updated_at = NOW()
    WHERE store_id = ${storeId}
  `;
}

async function applyScheduleEndAutoOff(
  sql: ReturnType<typeof getSql>,
  storeId: number,
  log: { info: (o: object, msg?: string) => void }
): Promise<void> {
  const nowIso = new Date().toISOString();
  await sql`
    UPDATE merchant_store_availability
    SET
      is_available = FALSE,
      is_accepting_orders = FALSE,
      unavailable_reason = 'auto_off',
      close_reason = 'Auto-off after schedule end',
      auto_unavailable_at = ${nowIso},
      auto_available_at = NULL,
      manual_close_until = NULL,
      is_manual_override = FALSE,
      manual_override_at = NULL,
      schedule_end_prompted_at = NULL,
      schedule_end_prompt_expires_at = NULL,
      auto_off_reason = 'schedule_end_timeout',
      last_auto_action_at = ${nowIso},
      last_toggle_type = 'AUTO_OFF',
      restriction_type = 'schedule',
      updated_by = ${UPDATED_BY_SYSTEM},
      updated_by_id = ${UPDATED_BY_ID_SYSTEM},
      last_toggled_at = ${nowIso},
      updated_at = NOW()
    WHERE store_id = ${storeId}
  `;
  await sql`
    INSERT INTO merchant_store_status_log (store_id, action, restriction_type, close_reason)
    VALUES (${storeId}, 'store_closed_auto', 'AUTO_OFF', 'schedule_end_timeout')
  `;
  log.info({ storeId, trigger: "schedule_end_timeout" }, "store_auto_off");
  await emitStoreStatusChanged(sql, storeId, "OPEN", "CLOSED", "schedule_end_timeout", "AUTO", log);
}

/** Parse manual_close_until to ms; invalid or null => 0. */
function parseManualCloseUntilMs(raw: Date | string | null | undefined): number {
  if (raw == null) return 0;
  try {
    let s = typeof raw === "string" ? raw.trim().replace(" ", "T") : "";
    // Normalize timezone offsets for consistent parsing:
    // - "+0530" -> "+05:30"
    // - "+00" / "+0000" -> "+00:00"
    if (s && !/[zZ]$/.test(s)) {
      s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
      s = s.replace(/([+-]\d{2})$/, "$1:00");
    }
    const d = raw instanceof Date ? raw : new Date(s || String(raw));
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
}

/** Return true only if DB says store has no active manual close (manual_close_until is null or in the past). */
async function hasNoActiveManualClose(
  sql: ReturnType<typeof getSql>,
  storeId: number
): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM merchant_store_availability
    WHERE store_id = ${storeId}
      AND (manual_close_until IS NULL OR manual_close_until <= NOW())
      AND (unavailable_reason IS NULL OR unavailable_reason <> 'manual_indefinite')
    LIMIT 1
  `;
  return rows.length > 0;
}

type Slot = { startMin: number; endMin: number };

function parseTimeToMinutes(t: string | null | undefined): number | null {
  if (t == null || typeof t !== "string") return null;
  const s = String(t).trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!match) return null;
  const h = Math.min(23, Math.max(0, Number(match[1]) || 0));
  const m = Math.min(59, Math.max(0, Number(match[2]) || 0));
  const sec = match[3] != null ? Math.min(59, Math.max(0, Number(match[3]) || 0)) : 0;
  return h * 60 + m + sec / 60;
}

function getSlotsForDay(
  row: Record<string, unknown>,
  dayKey: string,
  sameForAll: boolean
): Slot[] {
  const day = sameForAll ? "monday" : dayKey;
  const open = row[`${day}_open`] === true;
  if (!open) return [];
  const s1Start = parseTimeToMinutes(row[`${day}_slot1_start`] as string);
  const s1End = parseTimeToMinutes(row[`${day}_slot1_end`] as string);
  const s2Start = parseTimeToMinutes(row[`${day}_slot2_start`] as string);
  const s2End = parseTimeToMinutes(row[`${day}_slot2_end`] as string);
  const slots: Slot[] = [];
  if (s1Start != null && s1End != null && s1End > s1Start) slots.push({ startMin: s1Start, endMin: s1End });
  if (s2Start != null && s2End != null && s2End > s2Start) slots.push({ startMin: s2Start, endMin: s2End });
  return slots;
}

/** Current time in store TZ: day of week (0-6) and minutes since midnight. */
function nowInStoreTz(): { dayOfWeek: number; minutesSinceMidnight: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const second = Number(parts.find((p) => p.type === "second")?.value ?? 0);
  const minutesSinceMidnight = hour * 60 + minute + second / 60;

  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: STORE_TIMEZONE, weekday: "short" });
  const dayShort = dayFormatter.format(new Date()).toLowerCase();
  const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const dayOfWeek = dayMap[dayShort.slice(0, 3)] ?? 0;
  return { dayOfWeek, minutesSinceMidnight };
}

/** True if current time (IST) is within any operating slot for today. Uses grace buffer at slot end. */
export function isWithinOperatingHours(
  row: Record<string, unknown>,
  dayOfWeek: number,
  minutesSinceMidnight: number
): boolean {
  const is24 = row.is_24_hours === true;
  if (is24) return true;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const dayKey = DAY_NAMES[dayOfWeek];
  if (closedDays.some((d) => String(d).toLowerCase() === dayKey)) return false;
  const sameForAll = row.same_for_all_days === true;
  const slots = getSlotsForDay(row, dayKey, sameForAll);
  const endGrace = GRACE_BUFFER_SECONDS / 60;
  for (const slot of slots) {
    if (minutesSinceMidnight >= slot.startMin && minutesSinceMidnight <= slot.endMin + endGrace) return true;
  }
  return false;
}

function minutesToTimeStr(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type NextOpenClose = {
  next_open_time: string | null;
  next_close_time: string | null;
};

/** Get next open/close times in store TZ for API (e.g. "14:30", "23:59"). */
export function getNextOpenClose(
  row: Record<string, unknown>,
  dayOfWeek: number,
  minutesSinceMidnight: number
): NextOpenClose {
  const out: NextOpenClose = { next_open_time: null, next_close_time: null };
  if (row.is_24_hours === true) return out;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const dayKey = DAY_NAMES[dayOfWeek];
  if (closedDays.some((d) => String(d).toLowerCase() === dayKey)) {
    const sameForAll = row.same_for_all_days === true;
    const slots = getSlotsForDay(row, sameForAll ? "monday" : dayKey, sameForAll);
    const first = slots.sort((a, b) => a.startMin - b.startMin)[0];
    if (first) out.next_open_time = minutesToTimeStr(first.startMin);
    return out;
  }
  const sameForAll = row.same_for_all_days === true;
  const slots = getSlotsForDay(row, dayKey, sameForAll).sort((a, b) => a.startMin - b.startMin);
  const endGrace = GRACE_BUFFER_SECONDS / 60;
  let withinSlot: Slot | null = null;
  for (const slot of slots) {
    if (minutesSinceMidnight >= slot.startMin && minutesSinceMidnight <= slot.endMin + endGrace) {
      withinSlot = slot;
      break;
    }
  }
  if (withinSlot) {
    out.next_close_time = minutesToTimeStr(withinSlot.endMin);
    return out;
  }
  for (const slot of slots) {
    if (slot.startMin > minutesSinceMidnight) {
      out.next_open_time = minutesToTimeStr(slot.startMin);
      return out;
    }
  }
  if (slots.length > 0) out.next_open_time = minutesToTimeStr(slots[0].startMin);
  return out;
}

/** Get next open moment as ISO string (IST), skipping closed days. Returns null if 24h or no slots. */
export function getNextOpenIso(
  row: Record<string, unknown>,
  dayOfWeek: number,
  minutesSinceMidnight: number,
  refDate: Date
): string | null {
  if (row.is_24_hours === true) return null;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const sameForAll = row.same_for_all_days === true;
  const formatIstDate = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: STORE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "0";
    const mo = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return { y, m: mo.padStart(2, "0"), d: day.padStart(2, "0") };
  };
  const addDaysInIst = (dateStr: string, days: number): string => {
    const d = new Date(dateStr + "T00:00:00+05:30");
    d.setTime(d.getTime() + days * 86400 * 1000);
    const p = formatIstDate(d);
    return `${p.y}-${p.m}-${p.d}`;
  };
  const refIst = formatIstDate(refDate);
  const todayStr = `${refIst.y}-${refIst.m}-${refIst.d}`;

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const checkDay = (dayOfWeek + dayOffset) % 7;
    const dayKey = DAY_NAMES[checkDay];
    if (closedDays.some((d) => String(d).toLowerCase() === dayKey)) continue;
    const slots = getSlotsForDay(row, dayKey, sameForAll).sort((a, b) => a.startMin - b.startMin);
    if (slots.length === 0) continue;
    const firstStart = slots[0].startMin;

    if (dayOffset === 0) {
      const hasLaterSlotToday = slots.some((s) => s.startMin > minutesSinceMidnight);
      if (hasLaterSlotToday) {
        const slot = slots.find((s) => s.startMin > minutesSinceMidnight)!;
        const timeStr = minutesToTimeStr(slot.startMin);
        const isoInIst = `${todayStr}T${timeStr}:00+05:30`;
        const dt = new Date(isoInIst);
        return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
      }
      continue;
    }

    const dateStr = addDaysInIst(todayStr, dayOffset);
    const timeStr = minutesToTimeStr(firstStart);
    const isoInIst = `${dateStr}T${timeStr}:00+05:30`;
    const dt = new Date(isoInIst);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  return null;
}

/**
 * Legacy "close for the day" stored as end-of-day IST on the same calendar day as `ref`.
 * In that case countdown should target the next real opening from schedule, not the EOD timestamp.
 */
export function isLikelyLegacyEndOfDayIstClose(untilIso: string, ref: Date): boolean {
  const until = new Date(untilIso);
  if (Number.isNaN(until.getTime())) return false;
  const dFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const tFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: STORE_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const du = dFmt.format(until);
  const dr = dFmt.format(ref);
  if (du !== dr) return false;
  const tp = tFmt.formatToParts(until);
  const hh = Number(tp.find((p) => p.type === "hour")?.value ?? 0);
  const mm = Number(tp.find((p) => p.type === "minute")?.value ?? 0);
  return hh > 23 || (hh === 23 && mm >= 59);
}

/**
 * First opening moment on a future IST calendar day only (never a slot later "today").
 * Used for "Close for today" so merchants do not see reopen at today's next slot (e.g. 11:30 same day).
 */
export function getNextOpenIsoAfterIstCalendarDay(
  row: Record<string, unknown>,
  dayOfWeek: number,
  refDate: Date
): string | null {
  if (row.is_24_hours === true) return null;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const sameForAll = row.same_for_all_days === true;
  const formatIstDate = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: STORE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "0";
    const mo = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return { y, m: mo.padStart(2, "0"), d: day.padStart(2, "0") };
  };
  const addDaysInIst = (dateStr: string, days: number): string => {
    const d = new Date(dateStr + "T00:00:00+05:30");
    d.setTime(d.getTime() + days * 86400 * 1000);
    const p = formatIstDate(d);
    return `${p.y}-${p.m}-${p.d}`;
  };
  const refIst = formatIstDate(refDate);
  const todayStr = `${refIst.y}-${refIst.m}-${refIst.d}`;

  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const checkDay = (dayOfWeek + dayOffset) % 7;
    const dayKey = DAY_NAMES[checkDay];
    if (closedDays.some((d) => String(d).toLowerCase() === dayKey)) continue;
    const slots = getSlotsForDay(row, dayKey, sameForAll).sort((a, b) => a.startMin - b.startMin);
    if (slots.length === 0) continue;
    const firstStart = slots[0].startMin;
    const dateStr = addDaysInIst(todayStr, dayOffset);
    const timeStr = minutesToTimeStr(firstStart);
    const isoInIst = `${dateStr}T${timeStr}:00+05:30`;
    const dt = new Date(isoInIst);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  return null;
}

/** Next open day (skip closed days) at 00:00 IST as ISO. For fallback when getNextOpenIso returns null. */
export function getNextOpenDayStartIso(
  row: Record<string, unknown>,
  dayOfWeek: number,
  refDate: Date
): string | null {
  if (row.is_24_hours === true) return null;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const formatIstDate = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: STORE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "0";
    const mo = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return { y, m: mo.padStart(2, "0"), d: day.padStart(2, "0") };
  };
  const refIst = formatIstDate(refDate);
  const todayStr = `${refIst.y}-${refIst.m}-${refIst.d}`;
  const addDays = (dateStr: string, days: number): string => {
    const d = new Date(dateStr + "T00:00:00+05:30");
    d.setTime(d.getTime() + days * 86400 * 1000);
    const p = formatIstDate(d);
    return `${p.y}-${p.m}-${p.d}`;
  };
  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const checkDay = (dayOfWeek + dayOffset) % 7;
    const dayKey = DAY_NAMES[checkDay];
    if (closedDays.some((d) => String(d).toLowerCase() === dayKey)) continue;
    const dateStr = addDays(todayStr, dayOffset);
    const isoInIst = `${dateStr}T00:00:00+05:30`;
    const dt = new Date(isoInIst);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  return null;
}

export { nowInStoreTz };

type StoreRow = {
  store_id: number;
  is_accepting_orders: boolean | null;
  is_active: boolean | null;
  auto_open_from_schedule: boolean | null;
  block_auto_open: boolean | null;
  manual_close_until: Date | string | null;
  unavailable_reason?: string | null;
  restriction_type?: string | null;
  is_available: boolean | null;
  avail_accepting: boolean | null;
  is_manual_override: boolean | null;
  schedule_end_prompt_expires_at: Date | string | null;
};

export async function runStoreScheduleTick(log: { info: (o: object, msg?: string) => void; error: (o: object, msg?: string) => void }): Promise<void> {
  const sql = getSql();
  try {
    const now = new Date();
    const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz();

    const storeRows = await sql`
      SELECT
        ms.id AS store_id,
        ms.is_accepting_orders,
        ms.is_active,
        msa.auto_open_from_schedule,
        msa.block_auto_open,
        msa.manual_close_until,
        msa.unavailable_reason,
        msa.restriction_type,
        msa.is_available,
        msa.is_accepting_orders AS avail_accepting,
        msa.is_manual_override,
        msa.schedule_end_prompt_expires_at
      FROM merchant_stores ms
      LEFT JOIN merchant_store_availability msa ON msa.store_id = ms.id
      WHERE ms.deleted_at IS NULL
    `;

    const storeIds = [
      ...new Set(
        (storeRows as unknown as StoreRow[])
          .map((s) => s.store_id)
          .filter((id) => Number.isInteger(id) && id > 0)
      ),
    ];
    const hoursRows =
      storeIds.length === 0
        ? []
        : await sql`
            SELECT * FROM merchant_store_operating_hours
            WHERE store_id IN ${sql(storeIds)}
          `;
    const hoursByStore = new Map<number, Record<string, unknown>>();
    for (const r of hoursRows as Record<string, unknown>[]) {
      const sid = Number((r as any).store_id);
      if (Number.isFinite(sid)) hoursByStore.set(sid, r);
    }

    const rushRows =
      storeIds.length === 0
        ? []
        : await sql`
            SELECT store_id
            FROM merchant_store_rush_windows
            WHERE store_id IN ${sql(storeIds)}
              AND is_active = TRUE
              AND ends_at > NOW()
          `;
    const rushActiveStoreIds = new Set<number>(
      (rushRows as unknown as Array<{ store_id: number | string }>).map((r) => Number((r as any).store_id)).filter((n) => Number.isFinite(n))
    );

    const closureRows =
      storeIds.length === 0
        ? []
        : await sql`
            SELECT store_id, ends_at
            FROM merchant_store_scheduled_closures
            WHERE store_id IN ${sql(storeIds)}
              AND status IN ('scheduled', 'active')
              AND starts_at <= NOW()
              AND ends_at > NOW()
          `;
    const activeClosureEndByStore = new Map<number, string>();
    for (const r of closureRows as unknown as Array<{ store_id: number | string; ends_at: Date | string }>) {
      const sid = Number((r as any).store_id);
      if (!Number.isFinite(sid)) continue;
      const endsAt = new Date(r.ends_at instanceof Date ? r.ends_at.toISOString() : String(r.ends_at));
      if (Number.isNaN(endsAt.getTime())) continue;
      activeClosureEndByStore.set(sid, endsAt.toISOString());
    }

    for (const store of storeRows as unknown as StoreRow[]) {
      const storeId = store.store_id;
      if (!Number.isInteger(storeId) || storeId < 1) continue;

      try {
        await ensureAvailabilityRow(sql, storeId);
      } catch (e) {
        log.error({ storeId, err: e }, "store_schedule_tick_ensure_availability_failed");
        continue;
      }

      const hoursRow = hoursByStore.get(storeId);
      const autoOpen = store.auto_open_from_schedule === true;
      const blockAutoOpen = store.block_auto_open === true;
      const manualCloseUntilMs = parseManualCloseUntilMs(store.manual_close_until);
      const nowMs = now.getTime();
      const isManualCloseActive = manualCloseUntilMs > 0 && nowMs < manualCloseUntilMs;
      const unavailableReasonNorm =
        store.unavailable_reason != null && String(store.unavailable_reason).trim() !== ""
          ? String(store.unavailable_reason).trim().toLowerCase()
          : "";
      const isManualIndefinite = unavailableReasonNorm === "manual_indefinite";
      const isManualOverride = store.is_manual_override === true;
      const promptExpiresMs = parseManualCloseUntilMs(store.schedule_end_prompt_expires_at);
      const currentlyOpen =
        store.is_accepting_orders === true &&
        store.avail_accepting !== false &&
        store.is_available !== false &&
        (store.is_active !== false);

      let withinHours = false;
      if (hoursRow) {
        withinHours = isWithinOperatingHours(hoursRow, dayOfWeek, minutesSinceMidnight);
      }

      try {
        // Vacation mode (scheduled closure active): force OFFLINE and ignore manual toggles/schedule.
        const closureEndsAtIso = activeClosureEndByStore.get(storeId) ?? null;
        if (closureEndsAtIso) {
          if (currentlyOpen) {
            await syncMerchantStoresOnlineTriple(sql, storeId, false);
          }
          await sql`
            UPDATE merchant_store_availability
            SET
              is_available = FALSE,
              is_accepting_orders = FALSE,
              unavailable_reason = 'vacation',
              close_reason = 'Vacation mode active',
              manual_close_until = ${closureEndsAtIso},
              restriction_type = 'VACATION',
              is_manual_override = FALSE,
              manual_override_at = NULL,
              schedule_end_prompted_at = NULL,
              schedule_end_prompt_expires_at = NULL,
              updated_by = ${UPDATED_BY_SYSTEM},
              updated_by_id = ${UPDATED_BY_ID_SYSTEM},
              last_toggle_type = 'AUTO_CLOSE',
              last_toggled_at = ${new Date().toISOString()},
              updated_at = NOW()
            WHERE store_id = ${storeId}
          `;
          continue;
        }

        // Fail-safe: no hours config => treat as closed (1. Schedule closed)
        if (!hoursRow) {
          if (currentlyOpen && autoOpen) {
            await syncMerchantStoresOnlineTriple(sql, storeId, false);
            await applyScheduleExpired(sql, storeId, log);
          }
          continue;
        }

        // 5. Forced lock
        if (blockAutoOpen) {
          if (currentlyOpen) {
            await syncMerchantStoresOnlineTriple(sql, storeId, false);
            await applyForcedLock(sql, storeId, log);
          }
          continue;
        }

        // Manual closure:
        // - temp close uses manual_close_until window
        // - manual_indefinite should also block auto-open during operating hours
        if (isManualCloseActive || isManualIndefinite) continue;
        if (!autoOpen) continue;

        // 2. Schedule open / 7. Auto reopen after manual close — only if DB says no active manual close
        if (withinHours) {
          if (!currentlyOpen) {
            const safeToOpen = await hasNoActiveManualClose(sql, storeId);
            if (!safeToOpen) continue;
            const manualCloseJustExpired = manualCloseUntilMs > 0 && nowMs >= manualCloseUntilMs;
            await syncMerchantStoresOnlineTriple(sql, storeId, true);
            await (manualCloseJustExpired ? applyAutoReopen(sql, storeId, log) : applyScheduleOpen(sql, storeId, log));
          }
        } else {
          // 3. Schedule end: show prompt then AUTO OFF (unless manual override / rush hours)
          if (currentlyOpen) {
            if (isManualOverride) continue;
            if (rushActiveStoreIds.has(storeId)) continue;

            if (!promptExpiresMs) {
              const nowIso = new Date().toISOString();
              await applyScheduleEndPromptStart(sql, storeId, nowIso);
              continue;
            }
            if (nowMs < promptExpiresMs) continue;

            await syncMerchantStoresOnlineTriple(sql, storeId, false);
            await applyScheduleEndAutoOff(sql, storeId, log);
          } else {
            // Clear stale manual_close_until so status shows schedule_closed
            await sql`
              UPDATE merchant_store_availability
              SET manual_close_until = NULL,
                  close_reason = NULL,
                  unavailable_reason = NULL,
                  last_toggle_type = NULL,
                  schedule_end_prompted_at = NULL,
                  schedule_end_prompt_expires_at = NULL,
                  updated_at = NOW()
              WHERE store_id = ${storeId}
                AND (manual_close_until IS NULL OR manual_close_until < NOW())
            `;
          }
        }
      } catch (e) {
        log.error({ storeId, err: e }, "store_schedule_tick_update_failed");
      }
    }
  } catch (err) {
    log.error({ err }, "store_schedule_tick_failed");
  }
}

/** Evaluate and update status for a single store (e.g. after operating hours change). */
export async function runStoreScheduleTickForStore(
  storeId: number,
  log: { info: (o: object, msg?: string) => void; error: (o: object, msg?: string) => void }
): Promise<void> {
  if (!Number.isInteger(storeId) || storeId < 1) return;
  const sql = getSql();
  try {
    await ensureAvailabilityRow(sql, storeId);
  } catch (e) {
    log.error({ storeId, err: e }, "store_schedule_tick_for_store_ensure_failed");
    return;
  }
  try {
    const now = new Date();
    const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz();
    const storeRows = await sql`
      SELECT
        ms.id AS store_id,
        ms.is_accepting_orders,
        ms.is_active,
        msa.auto_open_from_schedule,
        msa.block_auto_open,
        msa.manual_close_until,
        msa.unavailable_reason,
        msa.restriction_type,
        msa.is_available,
        msa.is_accepting_orders AS avail_accepting,
        msa.is_manual_override,
        msa.schedule_end_prompt_expires_at
      FROM merchant_stores ms
      LEFT JOIN merchant_store_availability msa ON msa.store_id = ms.id
      WHERE ms.id = ${storeId} AND ms.deleted_at IS NULL
    `;
    if (storeRows.length === 0) return;
    const hoursRows = await sql`SELECT * FROM merchant_store_operating_hours WHERE store_id = ${storeId} LIMIT 1`;
    const hoursRow = hoursRows[0] as Record<string, unknown> | undefined;
    const store = storeRows[0] as StoreRow;
    const autoOpen = store.auto_open_from_schedule === true;
    const blockAutoOpen = store.block_auto_open === true;
    const manualCloseUntilMs = parseManualCloseUntilMs(store.manual_close_until);
    const nowMs = now.getTime();
    const isManualCloseActive = manualCloseUntilMs > 0 && nowMs < manualCloseUntilMs;
    const unavailableReasonNorm =
      (store as any).unavailable_reason != null && String((store as any).unavailable_reason).trim() !== ""
        ? String((store as any).unavailable_reason).trim().toLowerCase()
        : "";
    const isManualIndefinite = unavailableReasonNorm === "manual_indefinite";
    const isManualOverride = store.is_manual_override === true;
    const promptExpiresMs = parseManualCloseUntilMs(store.schedule_end_prompt_expires_at);
    const currentlyOpen =
      store.is_accepting_orders === true &&
      store.avail_accepting !== false &&
      store.is_available !== false &&
      (store.is_active !== false);
    let withinHours = false;
    if (hoursRow) withinHours = isWithinOperatingHours(hoursRow, dayOfWeek, minutesSinceMidnight);

    // Vacation mode (scheduled closure active): force OFFLINE.
    const activeSchedRows = await sql`
      SELECT ends_at
      FROM merchant_store_scheduled_closures
      WHERE store_id = ${storeId}
        AND status IN ('scheduled', 'active')
        AND starts_at <= NOW()
        AND ends_at > NOW()
      ORDER BY starts_at ASC
      LIMIT 1
    `;
    if (activeSchedRows.length > 0) {
      const endsAtRaw = (activeSchedRows[0] as any)?.ends_at;
      const endsAt = new Date(endsAtRaw instanceof Date ? endsAtRaw.toISOString() : String(endsAtRaw));
      const endsAtIso = Number.isNaN(endsAt.getTime()) ? null : endsAt.toISOString();
      if (endsAtIso) {
        if (currentlyOpen) await syncMerchantStoresOnlineTriple(sql, storeId, false);
        await sql`
          UPDATE merchant_store_availability
          SET
            is_available = FALSE,
            is_accepting_orders = FALSE,
            unavailable_reason = 'vacation',
            close_reason = 'Vacation mode active',
            manual_close_until = ${endsAtIso},
            restriction_type = 'VACATION',
            is_manual_override = FALSE,
            manual_override_at = NULL,
            schedule_end_prompted_at = NULL,
            schedule_end_prompt_expires_at = NULL,
            updated_by = ${UPDATED_BY_SYSTEM},
            updated_by_id = ${UPDATED_BY_ID_SYSTEM},
            last_toggle_type = 'AUTO_CLOSE',
            last_toggled_at = ${new Date().toISOString()},
            updated_at = NOW()
          WHERE store_id = ${storeId}
        `;
        return;
      }
    }

    if (!hoursRow) {
      if (currentlyOpen && autoOpen) {
        await syncMerchantStoresOnlineTriple(sql, storeId, false);
        await applyScheduleExpired(sql, storeId, log);
      }
      return;
    }
    if (blockAutoOpen) {
      if (currentlyOpen) {
        await syncMerchantStoresOnlineTriple(sql, storeId, false);
        await applyForcedLock(sql, storeId, log);
      }
      return;
    }
    if (isManualCloseActive || isManualIndefinite) return;
    if (!autoOpen) return;
    if (withinHours) {
      if (!currentlyOpen) {
        const safeToOpen = await hasNoActiveManualClose(sql, storeId);
        if (!safeToOpen) return;
        const manualCloseJustExpired = manualCloseUntilMs > 0 && nowMs >= manualCloseUntilMs;
        await syncMerchantStoresOnlineTriple(sql, storeId, true);
        await (manualCloseJustExpired ? applyAutoReopen(sql, storeId, log) : applyScheduleOpen(sql, storeId, log));
      }
    } else {
      if (currentlyOpen) {
        if (isManualOverride) return;
        const rushRows = await sql`
          SELECT 1
          FROM merchant_store_rush_windows
          WHERE store_id = ${storeId}
            AND is_active = TRUE
            AND ends_at > NOW()
          LIMIT 1
        `;
        if (rushRows.length > 0) return;

        if (!promptExpiresMs) {
          const nowIso = new Date().toISOString();
          await applyScheduleEndPromptStart(sql, storeId, nowIso);
          return;
        }
        if (nowMs < promptExpiresMs) return;

        await syncMerchantStoresOnlineTriple(sql, storeId, false);
        await applyScheduleEndAutoOff(sql, storeId, log);
      } else {
        await sql`
          UPDATE merchant_store_availability
          SET manual_close_until = NULL,
              close_reason = NULL,
              unavailable_reason = NULL,
              last_toggle_type = NULL,
              schedule_end_prompted_at = NULL,
              schedule_end_prompt_expires_at = NULL,
              updated_at = NOW()
          WHERE store_id = ${storeId}
            AND (manual_close_until IS NULL OR manual_close_until < NOW())
        `;
      }
    }
  } catch (err) {
    log.error({ storeId, err }, "store_schedule_tick_for_store_failed");
  }
}
