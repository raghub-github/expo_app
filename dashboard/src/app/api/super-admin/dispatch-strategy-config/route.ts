/**
 * Super Admin — Dispatch Engine Phase 0 config (service radius + strategy/rate/retry).
 *
 * Backs platform_rider_service_radius and platform_rider_dispatch_strategy_config.
 * Defaults preserve current behavior (strategy 'nearest', pre-pickup rate 0).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const SERVICE_TYPES = ["food", "parcel", "person_ride"] as const;

const scoreWeightsSchema = z
  .object({
    distance: z.number(),
    acceptanceRate: z.number(),
    cancellationRate: z.number(),
    idleBonus: z.number(),
    workloadPenalty: z.number(),
    directionAlignment: z.number(),
  })
  .partial();

const bundleSchema = z.object({
  service_type: z.enum(SERVICE_TYPES),
  service_radius_meters: z.number().int().min(100).max(100000),
  strategy: z.enum(["nearest", "score", "balanced", "hybrid"]),
  score_weights: scoreWeightsSchema.optional(),
  retry_interval_seconds: z.number().int().min(30).max(3600),
  max_retry_duration_seconds: z.number().int().min(0).max(7200),
  pre_pickup_rate_per_km: z.number().min(0).max(1000),
  pre_pickup_funding: z.enum(["company", "customer", "shared"]),
  auto_cancel_on_exhaustion: z.boolean().optional(),
  enabled: z.boolean(),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sql = getSql();
  try {
    const serviceRadii = (await sql`
      SELECT service_type, radius_meters, updated_at
      FROM platform_rider_service_radius
      ORDER BY service_type ASC
    `) as Array<{ service_type: string; radius_meters: number; updated_at?: string }>;

    const strategyConfigs = (await sql`
      SELECT
        service_type, strategy, score_weights, retry_interval_seconds,
        max_retry_duration_seconds, pre_pickup_rate_per_km, pre_pickup_funding,
        auto_cancel_on_exhaustion, enabled, updated_at
      FROM platform_rider_dispatch_strategy_config
      ORDER BY service_type ASC
    `) as Array<Record<string, unknown>>;

    return NextResponse.json({
      ok: true,
      service_radii: (serviceRadii ?? []).map((r) => ({
        service_type: r.service_type,
        radius_meters: Number(r.radius_meters),
        updated_at: r.updated_at,
      })),
      strategy_configs: (strategyConfigs ?? []).map((r) => ({
        service_type: String(r.service_type),
        strategy: String(r.strategy),
        score_weights:
          r.score_weights && typeof r.score_weights === "object"
            ? r.score_weights
            : {},
        retry_interval_seconds: Number(r.retry_interval_seconds),
        max_retry_duration_seconds: Number(r.max_retry_duration_seconds),
        pre_pickup_rate_per_km: Number(r.pre_pickup_rate_per_km),
        pre_pickup_funding: String(r.pre_pickup_funding),
        auto_cancel_on_exhaustion: r.auto_cancel_on_exhaustion === true,
        enabled: r.enabled !== false,
        updated_at: r.updated_at,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load dispatch strategy config";
    return NextResponse.json({ error: msg }, { status: 500 });
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

  const parsed = bundleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const d = parsed.data;

  const sql = getSql();
  try {
    await sql`
      INSERT INTO platform_rider_service_radius (service_type, radius_meters)
      VALUES (${d.service_type}, ${d.service_radius_meters})
      ON CONFLICT (service_type) DO UPDATE SET
        radius_meters = EXCLUDED.radius_meters,
        updated_at = NOW()
    `;

    const scoreWeightsJson = JSON.stringify(d.score_weights ?? {});
    await sql`
      INSERT INTO platform_rider_dispatch_strategy_config (
        service_type, strategy, score_weights, retry_interval_seconds,
        max_retry_duration_seconds, pre_pickup_rate_per_km, pre_pickup_funding,
        auto_cancel_on_exhaustion, enabled
      )
      VALUES (
        ${d.service_type},
        ${d.strategy},
        ${scoreWeightsJson}::jsonb,
        ${d.retry_interval_seconds},
        ${d.max_retry_duration_seconds},
        ${d.pre_pickup_rate_per_km},
        ${d.pre_pickup_funding},
        ${d.auto_cancel_on_exhaustion ?? false},
        ${d.enabled}
      )
      ON CONFLICT (service_type) DO UPDATE SET
        strategy = EXCLUDED.strategy,
        score_weights = EXCLUDED.score_weights,
        retry_interval_seconds = EXCLUDED.retry_interval_seconds,
        max_retry_duration_seconds = EXCLUDED.max_retry_duration_seconds,
        pre_pickup_rate_per_km = EXCLUDED.pre_pickup_rate_per_km,
        pre_pickup_funding = EXCLUDED.pre_pickup_funding,
        auto_cancel_on_exhaustion = EXCLUDED.auto_cancel_on_exhaustion,
        enabled = EXCLUDED.enabled,
        updated_at = NOW()
    `;

    return NextResponse.json({ ok: true, service_type: d.service_type });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save dispatch strategy config";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
