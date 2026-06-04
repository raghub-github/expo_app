import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const SERVICE_TYPES = ["food", "parcel", "person_ride"] as const;

/** Max milestone radius (100 km) — wide enough for testing; still bounded in DB. */
export const RIDER_STATUS_GEO_FENCE_MAX_RADIUS_METERS = 100_000;

const upsertSchema = z.object({
  service_type: z.enum(SERVICE_TYPES),
  milestone_key: z.string().min(2).max(64),
  radius_meters: z
    .number()
    .int()
    .min(1)
    .max(RIDER_STATUS_GEO_FENCE_MAX_RADIUS_METERS),
  is_active: z.boolean().optional(),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT id, service_type, milestone_key, radius_meters, is_active, updated_at
      FROM platform_rider_status_radius_rules
      ORDER BY service_type ASC, milestone_key ASC
    `) as Array<Record<string, unknown>>;

    return NextResponse.json({ ok: true, rows: rows ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load rules";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let input: z.infer<typeof upsertSchema>;
  try {
    input = upsertSchema.parse(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid input";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const sql = getSql();
  try {
    await sql`
      INSERT INTO platform_rider_status_radius_rules (
        service_type, milestone_key, radius_meters, is_active
      )
      VALUES (
        ${input.service_type},
        ${input.milestone_key},
        ${input.radius_meters},
        ${input.is_active ?? true}
      )
      ON CONFLICT (service_type, milestone_key) DO UPDATE SET
        radius_meters = EXCLUDED.radius_meters,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `;

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
