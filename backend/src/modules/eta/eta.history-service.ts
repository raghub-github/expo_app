/**
 * Load immutable ETA history and map to timeline entries.
 */
import { getSql } from "../../db/client.js";
import {
  mapHistoryRowsToTimeline,
  type EtaTimelineAudience,
  type EtaTimelineEntry,
  type RawEtaHistoryRow,
} from "./eta.timeline.js";
import { resolveCanonicalOrderIdText } from "./eta.order-ref.js";

export async function getEtaTimelineForOrder(
  orderIdText: string,
  opts?: {
    audience?: EtaTimelineAudience;
    limit?: number;
    order?: "asc" | "desc";
  }
): Promise<{ orderIdText: string; entries: EtaTimelineEntry[] }> {
  const audience = opts?.audience ?? "customer";
  const limit = Math.max(1, Math.min(200, opts?.limit ?? 100));
  const order = opts?.order ?? (audience === "customer" ? "asc" : "desc");
  const sql = getSql();
  const canonical = (await resolveCanonicalOrderIdText(orderIdText)) ?? orderIdText.trim();

  let rows: RawEtaHistoryRow[];
  try {
    rows = await sql<RawEtaHistoryRow[]>`
      SELECT id, old_eta_min, old_eta_max, new_eta_min, new_eta_max,
             promised_delivery_at::text AS promised_delivery_at,
             new_promised_delivery_at::text AS new_promised_delivery_at,
             recalc_reason, prep_minutes, rider_assignment_minutes,
             rider_to_store_minutes, store_to_customer_minutes,
             traffic_delay_minutes, weather_delay_minutes,
             congestion_delay_minutes, buffer_minutes,
             rider_id, merchant_store_id,
             metadata,
             created_at::text AS created_at,
             order_status, current_stage, display_eta_minutes, total_eta_minutes,
             confidence, freeze_countdown, eta_source, delta_minutes,
             previous_snapshot, new_snapshot
      FROM order_eta_history
      WHERE order_id_text = ${canonical}
      ORDER BY id ASC
      LIMIT ${limit}
    `;
  } catch {
    rows = await sql<RawEtaHistoryRow[]>`
      SELECT id, old_eta_min, old_eta_max, new_eta_min, new_eta_max,
             promised_delivery_at::text AS promised_delivery_at,
             new_promised_delivery_at::text AS new_promised_delivery_at,
             recalc_reason, prep_minutes, rider_assignment_minutes,
             rider_to_store_minutes, store_to_customer_minutes,
             traffic_delay_minutes, weather_delay_minutes,
             congestion_delay_minutes, buffer_minutes,
             rider_id, merchant_store_id,
             metadata,
             created_at::text AS created_at
      FROM order_eta_history
      WHERE order_id_text = ${canonical}
      ORDER BY id ASC
      LIMIT ${limit}
    `;
  }

  return {
    orderIdText: canonical,
    entries: mapHistoryRowsToTimeline(rows, audience, order),
  };
}
