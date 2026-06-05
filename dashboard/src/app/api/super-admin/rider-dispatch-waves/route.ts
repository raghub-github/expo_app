import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";
import { formatRadiusDisplay, parseRadiusToMeters } from "@/lib/rider-dispatch-radius";

export const runtime = "nodejs";

const SERVICE_TYPES = ["food", "parcel", "person_ride"] as const;

const waveSettingsSchema = z.object({
  service_type: z.enum(SERVICE_TYPES),
  wave_interval_seconds: z.number().int().min(5).max(600),
  max_waves: z.number().int().min(1).max(10),
  max_dispatch_radius_meters: z.number().int().min(100).max(50000),
  enabled: z.boolean(),
});

const expansionSchema = z.object({
  service_type: z.enum(SERVICE_TYPES),
  wave_number: z.number().int().min(2).max(10),
  effective_radius_meters: z.number().int().min(100).max(50000),
});

const serviceBundleSchema = z.object({
  service_type: z.enum(SERVICE_TYPES),
  wave1_radius_input: z.string().min(1).max(32),
  wave_interval_seconds: z.number().int().min(5).max(600),
  max_waves: z.number().int().min(1).max(10),
  max_dispatch_radius_meters: z.number().int().min(100).max(50000),
  enabled: z.boolean(),
  rider_accept_flow: z
    .enum(["before_merchant_accept", "after_merchant_accept"])
    .optional(),
  expansions: z.array(
    z.object({
      wave_number: z.number().int().min(2).max(10),
      effective_radius_meters: z.number().int().min(100).max(50000),
    })
  ),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sql = getSql();
  try {
    const settings = (await sql`
      SELECT service_type, wave_interval_seconds, max_waves, max_dispatch_radius_meters, enabled, updated_at
      FROM platform_rider_dispatch_wave_settings
      ORDER BY service_type ASC
    `) as Array<Record<string, unknown>>;

    const expansions = (await sql`
      SELECT service_type, wave_number, effective_radius_meters, updated_at
      FROM platform_rider_dispatch_wave_expansion
      ORDER BY service_type ASC, wave_number ASC
    `) as Array<Record<string, unknown>>;

    const baseRadii = (await sql`
      SELECT service_type, radius_meters, updated_at
      FROM platform_rider_dispatch_pickup_radius
      ORDER BY service_type ASC
    `) as Array<{ service_type: string; radius_meters: number; updated_at?: string }>;

    const acceptFlows = (await sql`
      SELECT service_type, rider_accept_flow, updated_at
      FROM platform_service_rider_accept_flow
      ORDER BY service_type ASC
    `) as Array<{ service_type: string; rider_accept_flow: string; updated_at?: string }>;

    return NextResponse.json({
      ok: true,
      settings: (settings ?? []).map((r) => ({
        service_type: String(r.service_type),
        wave_interval_seconds: Number(r.wave_interval_seconds),
        max_waves: Number(r.max_waves),
        max_dispatch_radius_meters: Number(r.max_dispatch_radius_meters),
        enabled: r.enabled !== false,
        updated_at: r.updated_at,
      })),
      expansions: (expansions ?? []).map((r) => ({
        service_type: String(r.service_type),
        wave_number: Number(r.wave_number),
        effective_radius_meters: Number(r.effective_radius_meters),
        updated_at: r.updated_at,
      })),
      base_radii: (baseRadii ?? []).map((r) => ({
        service_type: r.service_type,
        radius_meters: Number(r.radius_meters),
        radius_display: formatRadiusDisplay(Number(r.radius_meters)),
        updated_at: r.updated_at,
      })),
      accept_flows: (acceptFlows ?? []).map((r) => ({
        service_type: String(r.service_type),
        rider_accept_flow: String(r.rider_accept_flow),
        updated_at: r.updated_at,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load wave settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function saveServiceBundle(d: z.infer<typeof serviceBundleSchema>) {
  const wave1Meters = parseRadiusToMeters(d.wave1_radius_input);
  const sql = getSql();

  await sql`
    INSERT INTO platform_rider_dispatch_pickup_radius (service_type, radius_meters)
    VALUES (${d.service_type}, ${wave1Meters})
    ON CONFLICT (service_type) DO UPDATE SET
      radius_meters = EXCLUDED.radius_meters,
      updated_at = NOW()
  `;

  await sql`
    INSERT INTO platform_rider_dispatch_wave_settings (
      service_type, wave_interval_seconds, max_waves, max_dispatch_radius_meters, enabled
    )
    VALUES (
      ${d.service_type},
      ${d.wave_interval_seconds},
      ${d.max_waves},
      ${d.max_dispatch_radius_meters},
      ${d.enabled}
    )
    ON CONFLICT (service_type) DO UPDATE SET
      wave_interval_seconds = EXCLUDED.wave_interval_seconds,
      max_waves = EXCLUDED.max_waves,
      max_dispatch_radius_meters = EXCLUDED.max_dispatch_radius_meters,
      enabled = EXCLUDED.enabled,
      updated_at = NOW()
  `;

  for (const ex of d.expansions) {
    if (ex.wave_number > d.max_waves) continue;
    await sql`
      INSERT INTO platform_rider_dispatch_wave_expansion (
        service_type, wave_number, effective_radius_meters
      )
      VALUES (${d.service_type}, ${ex.wave_number}, ${ex.effective_radius_meters})
      ON CONFLICT (service_type, wave_number) DO UPDATE SET
        effective_radius_meters = EXCLUDED.effective_radius_meters,
        updated_at = NOW()
    `;
  }

  await sql`
    DELETE FROM platform_rider_dispatch_wave_expansion
    WHERE service_type = ${d.service_type}
      AND wave_number > ${d.max_waves}
  `;

  if (d.service_type === "food" && d.rider_accept_flow) {
    await sql`
      INSERT INTO platform_service_rider_accept_flow (service_type, rider_accept_flow)
      VALUES (${d.service_type}, ${d.rider_accept_flow})
      ON CONFLICT (service_type) DO UPDATE SET
        rider_accept_flow = EXCLUDED.rider_accept_flow,
        updated_at = NOW()
    `;
  }
}

export async function PUT(req: Request) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = z
    .union([
      z.object({ kind: z.literal("settings"), data: waveSettingsSchema }),
      z.object({ kind: z.literal("expansion"), data: expansionSchema }),
      z.object({ kind: z.literal("service_bundle"), data: serviceBundleSchema }),
    ])
    .safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const sql = getSql();
  try {
    if (parsed.data.kind === "service_bundle") {
      const d = parsed.data.data;
      const waveNumbers = new Set(d.expansions.map((e) => e.wave_number));
      for (let w = 2; w <= d.max_waves; w++) {
        if (!waveNumbers.has(w)) {
          return NextResponse.json(
            { error: `Missing radius for wave ${w}. Configure all expansion waves (2–${d.max_waves}).` },
            { status: 400 }
          );
        }
      }
      for (const ex of d.expansions) {
        if (ex.effective_radius_meters > d.max_dispatch_radius_meters) {
          return NextResponse.json(
            {
              error: `Wave ${ex.wave_number} radius exceeds max dispatch radius (${formatRadiusDisplay(d.max_dispatch_radius_meters)}).`,
            },
            { status: 400 }
          );
        }
      }
      await saveServiceBundle(d);
      return NextResponse.json({ ok: true, service_type: d.service_type });
    }

    if (parsed.data.kind === "settings") {
      const d = parsed.data.data;
      await sql`
        INSERT INTO platform_rider_dispatch_wave_settings (
          service_type, wave_interval_seconds, max_waves, max_dispatch_radius_meters, enabled
        )
        VALUES (
          ${d.service_type},
          ${d.wave_interval_seconds},
          ${d.max_waves},
          ${d.max_dispatch_radius_meters},
          ${d.enabled}
        )
        ON CONFLICT (service_type) DO UPDATE SET
          wave_interval_seconds = EXCLUDED.wave_interval_seconds,
          max_waves = EXCLUDED.max_waves,
          max_dispatch_radius_meters = EXCLUDED.max_dispatch_radius_meters,
          enabled = EXCLUDED.enabled,
          updated_at = NOW()
      `;
    } else {
      const d = parsed.data.data;
      await sql`
        INSERT INTO platform_rider_dispatch_wave_expansion (
          service_type, wave_number, effective_radius_meters
        )
        VALUES (${d.service_type}, ${d.wave_number}, ${d.effective_radius_meters})
        ON CONFLICT (service_type, wave_number) DO UPDATE SET
          effective_radius_meters = EXCLUDED.effective_radius_meters,
          updated_at = NOW()
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
