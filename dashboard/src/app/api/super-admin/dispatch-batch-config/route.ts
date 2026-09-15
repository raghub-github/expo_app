/**
 * GET / PUT /api/super-admin/dispatch-batch-config
 * Super-Admin control for the multi-order batching knobs (dispatch_batch_config). Direct DB, gated
 * by requireSuperAdminApi (same pattern as rider-assignment-controls). Person-ride batching is
 * force-disabled server-side regardless of input.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";

export const runtime = "nodejs";

const SERVICES = ["food", "parcel", "person_ride"] as const;

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT service_type, enabled,
             max_pickup_detour_km::float8 AS max_pickup_detour_km,
             max_pickup_detour_min::float8 AS max_pickup_detour_min,
             max_extra_drop_delay_min::float8 AS max_extra_drop_delay_min,
             avg_speed_kmph::float8 AS avg_speed_kmph,
             pickup_service_min::float8 AS pickup_service_min,
             drop_service_min::float8 AS drop_service_min,
             same_store_bonus::float8 AS same_store_bonus,
             batch_window_sec, updated_by, updated_at
      FROM dispatch_batch_config WHERE service_type IN ('food','parcel','person_ride')
      ORDER BY service_type
    `) as unknown as Array<Record<string, unknown>>;
    return NextResponse.json({ success: true, config: rows });
  } catch (e) {
    console.error("[dispatch-batch-config GET]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

const rowSchema = z.object({
  serviceType: z.enum(SERVICES),
  enabled: z.boolean(),
  maxPickupDetourKm: z.number().min(0).max(50),
  maxPickupDetourMin: z.number().min(0).max(120),
  maxExtraDropDelayMin: z.number().min(0).max(120),
  avgSpeedKmph: z.number().min(1).max(120),
  pickupServiceMin: z.number().min(0).max(60),
  dropServiceMin: z.number().min(0).max(60),
  sameStoreBonus: z.number().min(0).max(100),
  batchWindowSec: z.number().int().min(0).max(600),
});
const putSchema = z.object({ config: z.array(rowSchema).min(1) });

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid config", details: parsed.error.flatten() }, { status: 400 });
  }
  let updatedBy = "super_admin";
  try {
    const auth = await getAuthenticatedApiUser(req);
    if (auth.ok && auth.user?.email) updatedBy = auth.user.email;
  } catch {
    /* keep default */
  }
  try {
    const sql = getSql();
    for (const r of parsed.data.config) {
      // Person ride can never be batched — force enabled=false whatever the client sent.
      const enabled = r.serviceType === "person_ride" ? false : r.enabled;
      await sql`
        INSERT INTO dispatch_batch_config
          (service_type, enabled, max_pickup_detour_km, max_pickup_detour_min, max_extra_drop_delay_min,
           avg_speed_kmph, pickup_service_min, drop_service_min, same_store_bonus, batch_window_sec,
           updated_by, updated_at)
        VALUES (${r.serviceType}, ${enabled}, ${r.maxPickupDetourKm}, ${r.maxPickupDetourMin},
          ${r.maxExtraDropDelayMin}, ${r.avgSpeedKmph}, ${r.pickupServiceMin}, ${r.dropServiceMin},
          ${r.sameStoreBonus}, ${Math.trunc(r.batchWindowSec)}, ${updatedBy}, now())
        ON CONFLICT (service_type) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          max_pickup_detour_km = EXCLUDED.max_pickup_detour_km,
          max_pickup_detour_min = EXCLUDED.max_pickup_detour_min,
          max_extra_drop_delay_min = EXCLUDED.max_extra_drop_delay_min,
          avg_speed_kmph = EXCLUDED.avg_speed_kmph,
          pickup_service_min = EXCLUDED.pickup_service_min,
          drop_service_min = EXCLUDED.drop_service_min,
          same_store_bonus = EXCLUDED.same_store_bonus,
          batch_window_sec = EXCLUDED.batch_window_sec,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
      `;
    }
    return GET();
  } catch (e) {
    console.error("[dispatch-batch-config PUT]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
