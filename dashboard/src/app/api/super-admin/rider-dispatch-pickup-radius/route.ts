import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const SERVICE_TYPES = ["food", "parcel", "person_ride"] as const;

import { formatRadiusDisplay, parseRadiusToMeters } from "@/lib/rider-dispatch-radius";

const upsertSchema = z.object({
  service_type: z.enum(SERVICE_TYPES),
  radius_input: z.string().min(1).max(32),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT service_type, radius_meters, updated_at
      FROM platform_rider_dispatch_pickup_radius
      ORDER BY service_type ASC
    `) as Array<{ service_type: string; radius_meters: number; updated_at: string }>;

    return NextResponse.json({
      ok: true,
      rows: (rows ?? []).map((r) => ({
        service_type: r.service_type,
        radius_meters: Number(r.radius_meters),
        radius_display: formatRadiusDisplay(Number(r.radius_meters)),
        updated_at: r.updated_at,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load settings";
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

  let radiusMeters: number;
  try {
    radiusMeters = parseRadiusToMeters(input.radius_input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid radius";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const sql = getSql();
  try {
    await sql`
      INSERT INTO platform_rider_dispatch_pickup_radius (service_type, radius_meters)
      VALUES (${input.service_type}, ${radiusMeters})
      ON CONFLICT (service_type) DO UPDATE SET
        radius_meters = EXCLUDED.radius_meters,
        updated_at = NOW()
    `;

    return NextResponse.json({
      ok: true,
      service_type: input.service_type,
      radius_meters: radiusMeters,
      radius_display: formatRadiusDisplay(radiusMeters),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
