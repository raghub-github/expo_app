import "server-only";

import { getSql, str } from "@/lib/db/client";

export async function markRiderDutyOff(input: {
  riderId: number;
  adminSystemUserId: number;
  adminEmail?: string;
}) {
  const riderId = Number(input.riderId);
  if (!Number.isFinite(riderId) || riderId <= 0) throw new Error("Invalid rider id");

  const sql = getSql();
  const riderRows = await sql<{ id: number }[]>`
    SELECT id FROM riders WHERE id = ${riderId} AND deleted_at IS NULL LIMIT 1
  `;
  if (!riderRows[0]) throw new Error("Rider not found");

  const latest = await sql<{ status: string | null; session_id: string | null }[]>`
    SELECT status::text AS status, session_id
    FROM duty_logs
    WHERE rider_id = ${riderId}
    ORDER BY timestamp DESC, id DESC
    LIMIT 1
  `;
  const current = str(latest[0]?.status).toUpperCase();
  if (current !== "ON") {
    return { alreadyOff: true as const, riderId };
  }

  const meta = JSON.stringify({
    source: "coredash",
    offReason: "super_admin",
    markedBy: input.adminSystemUserId,
    markedByEmail: input.adminEmail || null,
  });

  await sql`
    INSERT INTO duty_logs (rider_id, status, service_types, session_id, metadata, timestamp)
    VALUES (
      ${riderId},
      'OFF'::duty_status,
      '[]'::jsonb,
      ${latest[0]?.session_id ?? null},
      ${meta}::jsonb,
      now()
    )
  `;

  await sql`
    UPDATE riders
    SET
      availability_status = 'OFFLINE'::rider_availability_status,
      active_vehicle_id = NULL,
      updated_at = now()
    WHERE id = ${riderId}
  `;

  return { alreadyOff: false as const, riderId };
}
