/**
 * Authoritative store surface status for Partner Site + customer APIs.
 * Same schedule tick + gate logic as merchant app GET /merchant-partner/stores/:id/status.
 */
import { getSql } from "../../db/client.js";
import {
  computeSurfaceLiveStatus,
  effectiveOperationalFromStoreRow,
} from "../../lib/store-surface-online.js";
import {
  isWithinOperatingHours,
  nowInStoreTz,
  runStoreScheduleTickForStore,
} from "./store-schedule-engine.js";

export type PartnerStoreStatusSnapshot = {
  store_id: number;
  is_open: boolean;
  operational_status: "OPEN" | "CLOSED";
  surface_online: boolean;
  within_operating_hours: boolean;
  is_active: boolean | null;
  is_accepting_orders: boolean | null;
  is_available: boolean | null;
  approval_status: string | null;
  auto_open_from_schedule: boolean;
  block_auto_open: boolean;
  manual_close_until: string | null;
  unavailable_reason: string | null;
  restriction_type: string | null;
  last_toggle_type: string | null;
  last_toggled_at: string | null;
  last_toggled_by_email: string | null;
  last_toggled_by_name: string | null;
  last_toggled_by_id: string | null;
};

function normalizeInstantStr(v: string): string {
  let s = v.trim().replace(" ", "T");
  if (s && !/[zZ]$/.test(s)) {
    s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    s = s.replace(/([+-]\d{2})$/, "$1:00");
  }
  return s;
}

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  const raw = v instanceof Date ? v : new Date(normalizeInstantStr(String(v)));
  return Number.isNaN(raw.getTime()) ? null : raw.toISOString();
}

export async function buildPartnerStoreStatusSnapshot(
  storeId: number,
  log: { info: (o: object, msg?: string) => void; error: (o: object, msg?: string) => void }
): Promise<PartnerStoreStatusSnapshot | null> {
  if (!Number.isInteger(storeId) || storeId < 1) return null;

  await runStoreScheduleTickForStore(storeId, log);

  const sql = getSql();
  const rows = await sql`
    SELECT ms.id,
           ms.operational_status,
           ms.is_accepting_orders,
           ms.is_active,
           ms.is_available AS store_is_available,
           ms.approval_status,
           msa.auto_open_from_schedule,
           msa.block_auto_open,
           msa.manual_close_until,
           msa.unavailable_reason,
           msa.restriction_type,
           msa.last_toggle_type,
           msa.last_toggled_at,
           msa.last_toggled_by_email,
           msa.last_toggled_by_name,
           msa.last_toggled_by_id
    FROM merchant_stores ms
    LEFT JOIN merchant_store_availability msa ON msa.store_id = ms.id
    WHERE ms.id = ${storeId} AND ms.deleted_at IS NULL
    LIMIT 1
  `;
  if (rows.length === 0) return null;

  const row = rows[0] as {
    id: number;
    operational_status?: string | null;
    is_accepting_orders?: boolean | null;
    is_active?: boolean | null;
    store_is_available?: boolean | null;
    approval_status?: string | null;
    auto_open_from_schedule?: boolean | null;
    block_auto_open?: boolean | null;
    manual_close_until?: Date | string | null;
    unavailable_reason?: string | null;
    restriction_type?: string | null;
    last_toggle_type?: string | null;
    last_toggled_at?: Date | string | null;
    last_toggled_by_email?: string | null;
    last_toggled_by_name?: string | null;
    last_toggled_by_id?: string | null;
  };

  const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz();
  const hoursRows = await sql`
    SELECT * FROM merchant_store_operating_hours WHERE store_id = ${storeId} LIMIT 1
  `;
  const hoursRow = hoursRows[0] as Record<string, unknown> | undefined;
  const withinOperatingHours = hoursRow
    ? isWithinOperatingHours(hoursRow, dayOfWeek, minutesSinceMidnight)
    : false;

  const operationalStatus =
    row.operational_status != null ? String(row.operational_status).trim().toUpperCase() : "";
  const effectiveOp = effectiveOperationalFromStoreRow({
    operational_status: operationalStatus,
    is_active: row.is_active,
    is_accepting_orders: row.is_accepting_orders,
    is_available: row.store_is_available,
    approval_status: row.approval_status,
  });
  const surfaceOnline = computeSurfaceLiveStatus(effectiveOp, withinOperatingHours) === "OPEN";

  return {
    store_id: storeId,
    is_open: surfaceOnline,
    operational_status: effectiveOp,
    surface_online: surfaceOnline,
    within_operating_hours: withinOperatingHours,
    is_active: row.is_active ?? null,
    is_accepting_orders: row.is_accepting_orders ?? null,
    is_available: row.store_is_available ?? null,
    approval_status: row.approval_status != null ? String(row.approval_status) : null,
    auto_open_from_schedule: row.auto_open_from_schedule !== false,
    block_auto_open: row.block_auto_open === true,
    manual_close_until: toIso(row.manual_close_until),
    unavailable_reason:
      row.unavailable_reason != null && String(row.unavailable_reason).trim() !== ""
        ? String(row.unavailable_reason).trim()
        : null,
    restriction_type:
      row.restriction_type != null && String(row.restriction_type).trim() !== ""
        ? String(row.restriction_type).trim()
        : null,
    last_toggle_type:
      row.last_toggle_type != null && String(row.last_toggle_type).trim() !== ""
        ? String(row.last_toggle_type).trim()
        : null,
    last_toggled_at: toIso(row.last_toggled_at),
    last_toggled_by_email:
      row.last_toggled_by_email != null && String(row.last_toggled_by_email).trim() !== ""
        ? String(row.last_toggled_by_email).trim()
        : null,
    last_toggled_by_name:
      row.last_toggled_by_name != null && String(row.last_toggled_by_name).trim() !== ""
        ? String(row.last_toggled_by_name).trim()
        : null,
    last_toggled_by_id:
      row.last_toggled_by_id != null && String(row.last_toggled_by_id).trim() !== ""
        ? String(row.last_toggled_by_id).trim()
        : null,
  };
}
