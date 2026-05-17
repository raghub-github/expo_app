import type { getSql } from "@/lib/db/client";

type Sql = ReturnType<typeof getSql>;

const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Recreate future scheduled_off holiday rows from active/upcoming closures. */
export async function rebuildScheduledOffHolidaysFromClosures(sql: Sql, storeId: number): Promise<void> {
  const todayUtc = new Date().toISOString().slice(0, 10);
  await sql`
    DELETE FROM merchant_store_holidays
    WHERE store_id = ${storeId}
      AND holiday_type = 'scheduled_off'
      AND holiday_date >= ${todayUtc}::date
  `;

  const nowIso = new Date().toISOString();
  const closures = await sql`
    SELECT reason, starts_at, ends_at
    FROM merchant_store_scheduled_closures
    WHERE store_id = ${storeId}
      AND status IN ('scheduled', 'active')
      AND ends_at > ${nowIso}::timestamptz
    ORDER BY starts_at ASC
  `;

  for (const c of closures) {
    const row = c as { reason: string | null; starts_at: Date | string; ends_at: Date | string };
    const startsAt = new Date(String(row.starts_at));
    const endsAt = new Date(String(row.ends_at));
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) continue;
    if (endsAt.getTime() <= startsAt.getTime()) continue;
    const reason =
      typeof row.reason === "string" && row.reason.trim() !== "" ? row.reason.trim() : "Scheduled time-off";
    const startDateStr = istDateFormatter.format(startsAt);
    const startTimeStr = startsAt.toISOString().slice(11, 19);
    const endTimeStr = endsAt.toISOString().slice(11, 19);
    const isFullDay = startTimeStr === "00:00:00" && endTimeStr >= "23:59:00";

    await sql`
      INSERT INTO merchant_store_holidays (
        store_id, holiday_name, holiday_type, holiday_date, is_full_day, closed_from, closed_till, closure_reason
      ) VALUES (
        ${storeId},
        'Scheduled off',
        'scheduled_off',
        ${startDateStr}::date,
        ${isFullDay},
        ${startTimeStr}::time,
        ${endTimeStr}::time,
        ${reason}
      )
    `;
  }
}

/** Clear vacation-ish availability when no scheduled closure is in window. */
export async function clearStaleScheduledClosureVacationOnAvailability(
  sql: Sql,
  storeId: number
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const activeRows = await sql`
    SELECT id FROM merchant_store_scheduled_closures
    WHERE store_id = ${storeId}
      AND status IN ('scheduled', 'active')
      AND starts_at <= ${nowIso}::timestamptz
      AND ends_at > ${nowIso}::timestamptz
    LIMIT 1
  `;
  if (activeRows.length > 0) return false;

  const availRows = await sql`
    SELECT unavailable_reason, restriction_type, close_reason
    FROM merchant_store_availability
    WHERE store_id = ${storeId}
    LIMIT 1
  `;
  const avail = availRows[0] as
    | {
        unavailable_reason: string | null;
        restriction_type: string | null;
        close_reason: string | null;
      }
    | undefined;
  if (!avail) return false;

  const unavail = String(avail.unavailable_reason ?? "").toLowerCase();
  const restriction = String(avail.restriction_type ?? "").toUpperCase();
  const cr = typeof avail.close_reason === "string" ? avail.close_reason.trim() : "";
  const staleVacAvail =
    unavail === "vacation" || restriction === "VACATION" || /^vacation\b/i.test(cr);
  if (!staleVacAvail) return false;

  await sql`
    UPDATE merchant_store_availability
    SET unavailable_reason = NULL,
        restriction_type = NULL,
        manual_close_until = NULL,
        close_reason = NULL,
        auto_off_reason = NULL,
        updated_at = NOW()
    WHERE store_id = ${storeId}
  `;
  return true;
}
