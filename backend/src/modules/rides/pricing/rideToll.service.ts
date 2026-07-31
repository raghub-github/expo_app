/**
 * Toll events — rider records tolls paid during the trip; amount is
 * reimbursed by the customer and passed through to the rider (no commission).
 */

import { getSql } from "../../../db/client.js";

function round2(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v * 100) / 100;
}

export type RideTollEvent = {
  id: number;
  orderCoreId: number;
  riderId: number | null;
  amount: number;
  paidByRider: boolean;
  lat: number | null;
  lng: number | null;
  note: string | null;
  proofUrl: string | null;
  createdAt: string;
};

export async function listRideTollEvents(orderCoreId: number): Promise<RideTollEvent[]> {
  const sql = getSql();
  const rows = await sql<
    Array<{
      id: number;
      order_core_id: number;
      rider_id: number | null;
      amount: string;
      paid_by_rider: boolean;
      lat: number | null;
      lng: number | null;
      note: string | null;
      proof_url: string | null;
      created_at: Date | string;
    }>
  >`
    SELECT id, order_core_id, rider_id, amount::text, paid_by_rider,
           lat, lng, note, proof_url, created_at
    FROM ride_toll_events
    WHERE order_core_id = ${orderCoreId}
    ORDER BY created_at ASC, id ASC
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    orderCoreId: Number(r.order_core_id),
    riderId: r.rider_id != null ? Number(r.rider_id) : null,
    amount: round2(Number(r.amount)),
    paidByRider: r.paid_by_rider !== false,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    note: r.note,
    proofUrl: r.proof_url,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

export async function sumRideTollAmount(orderCoreId: number): Promise<number> {
  const sql = getSql();
  const rows = await sql<Array<{ total: string }>>`
    SELECT COALESCE(SUM(amount), 0)::text AS total
    FROM ride_toll_events
    WHERE order_core_id = ${orderCoreId}
  `;
  return round2(Number(rows[0]?.total ?? 0));
}

export async function addRideTollEvent(input: {
  orderCoreId: number;
  riderId: number;
  amount: number;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  proofUrl?: string | null;
}): Promise<RideTollEvent> {
  const amount = round2(input.amount);
  if (!(amount > 0)) {
    throw Object.assign(new Error("Toll amount must be positive"), {
      statusCode: 400,
      code: "INVALID_TOLL_AMOUNT",
    });
  }
  if (amount > 5000) {
    throw Object.assign(new Error("Toll amount exceeds maximum"), {
      statusCode: 400,
      code: "TOLL_AMOUNT_TOO_HIGH",
    });
  }

  const sql = getSql();
  const order = await sql<
    Array<{ id: number; status: string | null; rider_id: number | null; order_type: string | null }>
  >`
    SELECT id, status, rider_id, order_type
    FROM orders_core
    WHERE id = ${input.orderCoreId}
    LIMIT 1
  `;
  const row = order[0];
  if (!row) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  if (String(row.order_type ?? "").toLowerCase() !== "person_ride") {
    throw Object.assign(new Error("Toll events are only for rides"), { statusCode: 400 });
  }
  if (Number(row.rider_id) !== Number(input.riderId)) {
    throw Object.assign(new Error("Only the assigned rider may add tolls"), {
      statusCode: 403,
      code: "NOT_ASSIGNED_RIDER",
    });
  }
  const status = String(row.status ?? "").toLowerCase();
  if (status === "cancelled" || status === "canceled") {
    throw Object.assign(new Error("Cannot add toll on cancelled ride"), { statusCode: 400 });
  }

  const inserted = await sql<
    Array<{
      id: number;
      order_core_id: number;
      rider_id: number | null;
      amount: string;
      paid_by_rider: boolean;
      lat: number | null;
      lng: number | null;
      note: string | null;
      proof_url: string | null;
      created_at: Date | string;
    }>
  >`
    INSERT INTO ride_toll_events (
      order_core_id, rider_id, amount, paid_by_rider, lat, lng, note, proof_url
    ) VALUES (
      ${input.orderCoreId}, ${input.riderId}, ${amount}, TRUE,
      ${input.lat ?? null}, ${input.lng ?? null},
      ${input.note ?? null}, ${input.proofUrl ?? null}
    )
    RETURNING id, order_core_id, rider_id, amount::text, paid_by_rider,
              lat, lng, note, proof_url, created_at
  `;
  const r = inserted[0]!;
  return {
    id: Number(r.id),
    orderCoreId: Number(r.order_core_id),
    riderId: r.rider_id != null ? Number(r.rider_id) : null,
    amount: round2(Number(r.amount)),
    paidByRider: true,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    note: r.note,
    proofUrl: r.proof_url,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}
