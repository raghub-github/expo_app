/**
 * DL-expiry warning job (§19–§21). Finds riders whose Driving Licence is approaching expiry,
 * and for each crossed warning window (30/15/7/3/1, configurable via DL_EXPIRY_WARNING_DAYS)
 * sends ONE push/in-app warning — recorded idempotently in rider_dl_expiry_notifications so a
 * window is never notified twice, even if the job runs repeatedly. Eligibility itself handles
 * the EXPIRED state live (via rider_documents.expiry_date), so this is warnings only.
 */
import { getSql } from "../../db/client.js";
import { emitEvent } from "../notifications/eventBus.js";
import { crossedUnnotifiedWindows, daysUntil, parseWarningWindows } from "./dlExpiry.js";

export function dlExpiryWarningWindows(): number[] {
  return parseWarningWindows(process.env.DL_EXPIRY_WARNING_DAYS);
}

export async function processDlExpiryNotifications(
  now: Date = new Date()
): Promise<{ scanned: number; notified: number }> {
  const windows = dlExpiryWarningWindows();
  const maxWindow = Math.max(...windows);
  const sql = getSql();

  // Latest DL expiry per rider that is not-yet-expired and within the widest warning window.
  const rows = (await sql`
    SELECT rider_id, MAX(expiry_date) AS expiry_date
    FROM rider_documents
    WHERE doc_type = 'dl'
      AND expiry_date IS NOT NULL
      AND expiry_date >= ${now}::date
      AND expiry_date <= (${now}::date + ${maxWindow} * INTERVAL '1 day')
    GROUP BY rider_id
  `) as Array<{ rider_id: number; expiry_date: string }>;

  let notified = 0;
  for (const row of rows) {
    const riderId = Number(row.rider_id);
    const daysRemaining = daysUntil(row.expiry_date, now);
    if (daysRemaining == null) continue;

    const sentRows = (await sql`
      SELECT window_days FROM rider_dl_expiry_notifications
      WHERE rider_id = ${riderId} AND expiry_date = ${row.expiry_date}::date
    `) as Array<{ window_days: number }>;
    const alreadyNotified = sentRows.map((r) => Number(r.window_days));

    const due = crossedUnnotifiedWindows(daysRemaining, windows, alreadyNotified);
    if (due.length === 0) continue;

    // Record ALL crossed windows (idempotent); notify once for the most urgent (smallest).
    for (const w of due) {
      await sql`
        INSERT INTO rider_dl_expiry_notifications (rider_id, expiry_date, window_days, channel)
        VALUES (${riderId}, ${row.expiry_date}::date, ${w}, 'push')
        ON CONFLICT (rider_id, expiry_date, window_days) DO NOTHING
      `;
    }
    try {
      emitEvent("rider.dl_expiring", {
        userId: `usr_${riderId}`,
        role: "rider",
        daysRemaining,
        expiryDate: row.expiry_date,
        window: due[0],
      });
    } catch {
      /* event emission is best-effort; the ledger is the source of truth */
    }
    notified += 1;
  }

  return { scanned: rows.length, notified };
}
