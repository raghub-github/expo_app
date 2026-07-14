/**
 * One-off data repair for the "close for today" countdown bug.
 *
 * Two bugs compounded to produce this: (1) `nowInStoreTz()` used `hour12: false` with the
 * "en-CA" locale, which on this ICU build resolves to hourCycle "h24" (1-24) instead of "h23"
 * (0-23) — so any evaluation during the 00:00-00:59 IST window read the hour as "24", pushing
 * `minutesSinceMidnight` 1440 too high and making the schedule engine think it was already
 * past every slot for the day; (2) "close for today" flows computed `manual_close_until` by
 * always skipping to a future calendar day, without checking whether today's own slot had
 * even started yet. Both are fixed at the source now (`nowInStoreTz` hourCycle fix +
 * `isBeforeFirstSlotToday` guard in `store-schedule-engine.ts` / `merchant-partner.routes.ts`).
 * The schedule-driven part self-heals on the next tick once the timezone fix lands — no data
 * fix needed for that. This script only matters for closures where a client explicitly wrote a
 * `manual_close_until` (not indefinite) while the bug was live: that's stored data, so it won't
 * self-correct.
 *
 * This script finds currently-active manual closures (not indefinite holds) whose stored
 * `manual_close_until` matches that exact bug signature — schedule-derived (aligned to a
 * future day's slot start), for a day later than necessary, when the close happened before
 * that day's own slot had started — and corrects them using the fixed logic. It intentionally
 * leaves alone any closure whose stored value doesn't match the bug's exact output, so
 * legitimate multi-day "temporary" closures (merchant-chosen duration) are never touched.
 *
 * Usage:
 *   npx tsx scripts/fix-close-for-today-skip.ts                    # dry run, prints affected rows
 *   npx tsx scripts/fix-close-for-today-skip.ts --apply             # applies the fix
 *   npx tsx scripts/fix-close-for-today-skip.ts --store-id 123 --apply   # scope to one store
 */
import { loadEnv } from "../src/config/loadEnv.js";
loadEnv();

import { getSql } from "../src/db/client.js";
import {
  getNextOpenIso,
  getNextOpenIsoAfterIstCalendarDay,
  getNextOpenDayStartIso,
  isBeforeFirstSlotToday,
} from "../src/modules/merchant-partner/store-schedule-engine.js";

const STORE_TIMEZONE = "Asia/Kolkata";

function storeTzPartsAt(ref: Date): { dayOfWeek: number; minutesSinceMidnight: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    // Do NOT add `hour12: false` here — see the file-level comment. hourCycle alone is
    // required; hour12 would win over hourCycle per spec and reintroduce the bug.
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(ref);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const second = Number(parts.find((p) => p.type === "second")?.value ?? 0);
  const minutesSinceMidnight = hour * 60 + minute + second / 60;

  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: STORE_TIMEZONE, weekday: "short" });
  const dayShort = dayFormatter.format(ref).toLowerCase();
  const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const dayOfWeek = dayMap[dayShort.slice(0, 3)] ?? 0;
  return { dayOfWeek, minutesSinceMidnight };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const storeIdArgIdx = process.argv.indexOf("--store-id");
  const scopedStoreId = storeIdArgIdx >= 0 ? Number(process.argv[storeIdArgIdx + 1]) : null;

  const sql = getSql();
  const rows = scopedStoreId
    ? await sql`
        SELECT msa.store_id, msa.manual_close_until, msa.auto_unavailable_at, msa.last_toggled_at, oh.*
        FROM merchant_store_availability msa
        JOIN merchant_store_operating_hours oh ON oh.store_id = msa.store_id
        WHERE msa.is_available = FALSE
          AND msa.restriction_type = 'manual'
          AND msa.block_auto_open = FALSE
          AND msa.manual_close_until IS NOT NULL
          AND msa.manual_close_until > NOW()
          AND msa.store_id = ${scopedStoreId}
      `
    : await sql`
        SELECT msa.store_id, msa.manual_close_until, msa.auto_unavailable_at, msa.last_toggled_at, oh.*
        FROM merchant_store_availability msa
        JOIN merchant_store_operating_hours oh ON oh.store_id = msa.store_id
        WHERE msa.is_available = FALSE
          AND msa.restriction_type = 'manual'
          AND msa.block_auto_open = FALSE
          AND msa.manual_close_until IS NOT NULL
          AND msa.manual_close_until > NOW()
      `;

  let fixedCount = 0;
  for (const row of rows as Record<string, unknown>[]) {
    const storeId = row.store_id as number;
    const rawClosedAt = row.auto_unavailable_at ?? row.last_toggled_at;
    const closedAt = rawClosedAt ? new Date(rawClosedAt as string | Date) : null;
    if (!closedAt || Number.isNaN(closedAt.getTime())) continue;

    const { dayOfWeek, minutesSinceMidnight } = storeTzPartsAt(closedAt);
    if (!isBeforeFirstSlotToday(row, dayOfWeek, minutesSinceMidnight)) continue; // not the bug signature

    const correctIso = getNextOpenIso(row, dayOfWeek, minutesSinceMidnight, closedAt);
    if (!correctIso) continue;

    const storedIso = new Date(row.manual_close_until as string | Date).toISOString();
    if (storedIso === correctIso) continue; // already correct

    // Only touch rows whose stored value is exactly what the OLD buggy "skip to a future
    // calendar day" computation would have produced — this is what distinguishes the bug
    // signature from a legitimate merchant-chosen multi-day closure duration.
    const buggyTargetIso =
      getNextOpenIsoAfterIstCalendarDay(row, dayOfWeek, closedAt) ??
      getNextOpenDayStartIso(row, dayOfWeek, closedAt);
    if (storedIso !== buggyTargetIso) continue;

    console.log(
      `store_id=${storeId} closed_at=${closedAt.toISOString()} stored=${storedIso} -> correct=${correctIso}`
    );
    fixedCount++;

    if (apply) {
      await sql`
        UPDATE merchant_store_availability
        SET manual_close_until = ${correctIso}, updated_at = NOW()
        WHERE store_id = ${storeId}
      `;
    }
  }

  console.log(`${apply ? "Fixed" : "Would fix (dry run, pass --apply to write)"}: ${fixedCount} row(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
