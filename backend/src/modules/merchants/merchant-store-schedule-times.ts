/**
 * Resolve next open/close instants from merchant_store_operating_hours for customer list/detail.
 */
import { getSql } from "../../db/client.js";
import {
  getNextOpenClose,
  getNextOpenIso,
  isWithinOperatingHours,
  nowInStoreTz,
} from "../merchant-partner/store-schedule-engine.js";

const STORE_TZ = "Asia/Kolkata";

export type StoreScheduleTimes = {
  nextOpenAt: string | null;
  nextCloseAt: string | null;
};

function hhmmToIsoOnIstDate(timeStr: string, dateStr: string): string | null {
  const t = timeStr.trim();
  if (!t) return null;
  const isoInIst = `${dateStr}T${t}:00+05:30`;
  const dt = new Date(isoInIst);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function istDateParts(ref: Date): { y: string; m: string; d: string; dateStr: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ref);
  const y = parts.find((p) => p.type === "year")?.value ?? "0";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return { y, m, d, dateStr: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

function addIstDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  d.setTime(d.getTime() + days * 86400 * 1000);
  return istDateParts(d).dateStr;
}

function resolveCloseIso(
  closeTime: string | null,
  ref: Date,
  minutesSinceMidnight: number
): string | null {
  if (!closeTime?.trim()) return null;
  const [hStr, mStr] = closeTime.trim().split(":");
  const closeMin = (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
  const { dateStr } = istDateParts(ref);
  let targetDate = dateStr;
  if (closeMin <= minutesSinceMidnight) {
    targetDate = addIstDays(dateStr, 1);
  }
  return hhmmToIsoOnIstDate(closeTime, targetDate);
}

/** Batch schedule times for customer cards (open → next close, closed → next open). */
export async function getScheduleTimesForStores(
  storeInternalIds: number[]
): Promise<Map<number, StoreScheduleTimes>> {
  const map = new Map<number, StoreScheduleTimes>();
  const ids = [...new Set(storeInternalIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;

  const sql = getSql();
  const rows = await sql`
    SELECT *
    FROM merchant_store_operating_hours
    WHERE store_id = ANY(${ids})
  `;

  const nowRef = new Date();
  const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz();

  for (const row of rows as Record<string, unknown>[]) {
    const storeId = Number(row.store_id);
    if (!Number.isFinite(storeId) || storeId < 1) continue;

    const within = isWithinOperatingHours(row, dayOfWeek, minutesSinceMidnight);
    const next = getNextOpenClose(row, dayOfWeek, minutesSinceMidnight);
    const nextOpenIso = getNextOpenIso(row, dayOfWeek, minutesSinceMidnight, nowRef);

    map.set(storeId, {
      nextOpenAt: within ? null : nextOpenIso,
      nextCloseAt: within ? resolveCloseIso(next.next_close_time, nowRef, minutesSinceMidnight) : null,
    });
  }

  return map;
}
