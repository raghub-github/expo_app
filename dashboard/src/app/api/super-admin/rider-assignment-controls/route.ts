import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const SERVICE_TYPES = ["food", "parcel", "person_ride"] as const;

const limitSchema = z.object({
  service_type: z.enum(SERVICE_TYPES),
  max_active_assignments: z.number().int().min(1).max(10),
  exclusive_mode: z.boolean().optional(),
});

const putSchema = z.object({
  limits: z.array(limitSchema).min(1).max(3),
  allow_cross_service_assignments: z.boolean(),
  person_ride_exclusive_mode: z.boolean(),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sql = getSql();
  try {
    const limits = (await sql`
      SELECT id, service_type, max_active_assignments, exclusive_mode, is_active, updated_at
      FROM platform_service_assignment_limits
      ORDER BY service_type ASC
    `) as Array<Record<string, unknown>>;

    const globalRows = (await sql`
      SELECT
        allow_cross_service_assignments,
        person_ride_exclusive_mode,
        is_active,
        updated_at
      FROM platform_dispatch_assignment_settings
      WHERE id = 1
      LIMIT 1
    `) as Array<Record<string, unknown>>;

    const global = globalRows[0];
    if (!global) {
      return NextResponse.json({ error: "Dispatch assignment settings missing" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      limits,
      global: {
        allow_cross_service_assignments: Boolean(global.allow_cross_service_assignments),
        person_ride_exclusive_mode: Boolean(global.person_ride_exclusive_mode),
        is_active: Boolean(global.is_active),
        updated_at: global.updated_at,
      },
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

  let input: z.infer<typeof putSchema>;
  try {
    input = putSchema.parse(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid input";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const sql = getSql();
  try {
    for (const row of input.limits) {
      const exclusive =
        row.service_type === "person_ride"
          ? input.person_ride_exclusive_mode
          : Boolean(row.exclusive_mode ?? false);
      await sql`
        INSERT INTO platform_service_assignment_limits (
          service_type, max_active_assignments, exclusive_mode, is_active
        )
        VALUES (
          ${row.service_type},
          ${row.max_active_assignments},
          ${exclusive},
          true
        )
        ON CONFLICT (service_type) DO UPDATE SET
          max_active_assignments = EXCLUDED.max_active_assignments,
          exclusive_mode = EXCLUDED.exclusive_mode,
          is_active = true,
          updated_at = NOW()
      `;
    }

    await sql`
      UPDATE platform_dispatch_assignment_settings
      SET
        allow_cross_service_assignments = ${input.allow_cross_service_assignments},
        person_ride_exclusive_mode = ${input.person_ride_exclusive_mode},
        is_active = true,
        updated_at = NOW()
      WHERE id = 1
    `;

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
