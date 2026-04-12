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
const GRACE_BUFFER_SECONDS = 30;
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

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
      updated_by, unavailable_reason, close_reason, last_toggle_type
    )
    VALUES (${storeId}, TRUE, TRUE, TRUE, FALSE, NOW(), ${UPDATED_BY_SYSTEM}, NULL, NULL, NULL)
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

/** Parse manual_close_until to ms; invalid or null => 0. */
function parseManualCloseUntilMs(raw: Date | string | null | undefined): number {
  if (raw == null) return 0;
  try {
    const s = typeof raw === "string" ? raw.trim().replace(" ", "T") : "";
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
  is_available: boolean | null;
  avail_accepting: boolean | null;
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
        msa.is_available,
        msa.is_accepting_orders AS avail_accepting
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
        // Fail-safe: no hours config => treat as closed (1. Schedule closed)
        if (!hoursRow) {
          if (currentlyOpen && autoOpen) {
            await sql`UPDATE merchant_stores SET is_accepting_orders = FALSE, updated_at = NOW() WHERE id = ${storeId}`;
            await applyScheduleExpired(sql, storeId, log);
          }
          continue;
        }

        // 5. Forced lock
        if (blockAutoOpen) {
          if (currentlyOpen) {
            await sql`UPDATE merchant_stores SET is_accepting_orders = FALSE, updated_at = NOW() WHERE id = ${storeId}`;
            await applyForcedLock(sql, storeId, log);
          }
          continue;
        }

        if (isManualCloseActive) continue;
        if (!autoOpen) continue;

        // 2. Schedule open / 7. Auto reopen after manual close — only if DB says no active manual close
        if (withinHours) {
          if (!currentlyOpen) {
            const safeToOpen = await hasNoActiveManualClose(sql, storeId);
            if (!safeToOpen) continue;
            const manualCloseJustExpired = manualCloseUntilMs > 0 && nowMs >= manualCloseUntilMs;
            await sql`UPDATE merchant_stores SET is_accepting_orders = TRUE, updated_at = NOW() WHERE id = ${storeId}`;
            await (manualCloseJustExpired ? applyAutoReopen(sql, storeId, log) : applyScheduleOpen(sql, storeId, log));
          }
        } else {
          // 1. Schedule closed (outside hours)
          if (currentlyOpen) {
            const recentManualOpen = await sql`
              SELECT 1 FROM merchant_store_status_log
              WHERE store_id = ${storeId} AND action = 'manual_open'
                AND created_at > NOW() - INTERVAL '2 minutes'
            LIMIT 1
            `;
            if (recentManualOpen.length > 0) continue;
            await sql`UPDATE merchant_stores SET is_accepting_orders = FALSE, updated_at = NOW() WHERE id = ${storeId}`;
            await applyScheduleClosed(sql, storeId, log);
          } else {
            // Clear stale manual_close_until so status shows schedule_closed
            await sql`
              UPDATE merchant_store_availability
              SET manual_close_until = NULL, close_reason = NULL, unavailable_reason = NULL, last_toggle_type = NULL, updated_at = NOW()
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
        msa.is_available,
        msa.is_accepting_orders AS avail_accepting
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
    const currentlyOpen =
      store.is_accepting_orders === true &&
      store.avail_accepting !== false &&
      store.is_available !== false &&
      (store.is_active !== false);
    let withinHours = false;
    if (hoursRow) withinHours = isWithinOperatingHours(hoursRow, dayOfWeek, minutesSinceMidnight);

    if (!hoursRow) {
      if (currentlyOpen && autoOpen) {
        await sql`UPDATE merchant_stores SET is_accepting_orders = FALSE, updated_at = NOW() WHERE id = ${storeId}`;
        await applyScheduleExpired(sql, storeId, log);
      }
      return;
    }
    if (blockAutoOpen) {
      if (currentlyOpen) {
        await sql`UPDATE merchant_stores SET is_accepting_orders = FALSE, updated_at = NOW() WHERE id = ${storeId}`;
        await applyForcedLock(sql, storeId, log);
      }
      return;
    }
    if (isManualCloseActive) return;
    if (!autoOpen) return;
    if (withinHours) {
      if (!currentlyOpen) {
        const safeToOpen = await hasNoActiveManualClose(sql, storeId);
        if (!safeToOpen) return;
        const manualCloseJustExpired = manualCloseUntilMs > 0 && nowMs >= manualCloseUntilMs;
        await sql`UPDATE merchant_stores SET is_accepting_orders = TRUE, updated_at = NOW() WHERE id = ${storeId}`;
        await (manualCloseJustExpired ? applyAutoReopen(sql, storeId, log) : applyScheduleOpen(sql, storeId, log));
      }
    } else {
      if (currentlyOpen) {
        const recentManualOpen = await sql`
          SELECT 1 FROM merchant_store_status_log
          WHERE store_id = ${storeId} AND action = 'manual_open'
            AND created_at > NOW() - INTERVAL '2 minutes'
        LIMIT 1
        `;
        if (recentManualOpen.length === 0) {
          await sql`UPDATE merchant_stores SET is_accepting_orders = FALSE, updated_at = NOW() WHERE id = ${storeId}`;
          await applyScheduleClosed(sql, storeId, log);
        }
      } else {
        await sql`
          UPDATE merchant_store_availability
          SET manual_close_until = NULL, close_reason = NULL, unavailable_reason = NULL, last_toggle_type = NULL, updated_at = NOW()
          WHERE store_id = ${storeId}
            AND (manual_close_until IS NULL OR manual_close_until < NOW())
        `;
      }
    }
  } catch (err) {
    log.error({ storeId, err }, "store_schedule_tick_for_store_failed");
  }
}
