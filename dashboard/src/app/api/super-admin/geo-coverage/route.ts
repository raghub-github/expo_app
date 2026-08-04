/**
 * Super Admin — Geo & Pincode Coverage (Dispatch Engine Phase 1).
 *
 * CRUD over geo_coverage. Match values for city/state/country are normalized to
 * lowercase+trim (the resolver matches the same way); pincode is trimmed only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const SERVICE_TYPES = ["food", "parcel", "person_ride"] as const;
const MATCH_TYPES = ["pincode", "city", "state", "country"] as const;
const STRATEGIES = ["nearest", "score", "balanced", "hybrid"] as const;

const upsertSchema = z.object({
  service_type: z.enum(SERVICE_TYPES),
  match_type: z.enum(MATCH_TYPES),
  match_value: z.string().min(1).max(120),
  enabled: z.boolean(),
  self_pickup_enabled: z.boolean(),
  delivery_enabled: z.boolean(),
  internal_rider_enabled: z.boolean(),
  tpl_enabled: z.boolean(),
  service_radius_meters: z.number().int().min(1).max(100000).nullable().optional(),
  dispatch_radius_meters: z.number().int().min(1).max(50000).nullable().optional(),
  max_retry_duration_seconds: z.number().int().min(0).max(7200).nullable().optional(),
  strategy: z.enum(STRATEGIES).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

function normalizeMatchValue(matchType: string, raw: string): string {
  const trimmed = raw.trim();
  return matchType === "pincode" ? trimmed : trimmed.toLowerCase();
}

export async function GET(req: Request) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const serviceFilter = url.searchParams.get("service_type");
  const sql = getSql();
  try {
    const rows = (serviceFilter && SERVICE_TYPES.includes(serviceFilter as (typeof SERVICE_TYPES)[number])
      ? await sql`
          SELECT * FROM geo_coverage
          WHERE service_type = ${serviceFilter}
          ORDER BY service_type ASC, match_type ASC, match_value ASC
        `
      : await sql`
          SELECT * FROM geo_coverage
          ORDER BY service_type ASC, match_type ASC, match_value ASC
        `) as Array<Record<string, unknown>>;

    return NextResponse.json({
      ok: true,
      coverage: (rows ?? []).map((r) => ({
        id: Number(r.id),
        service_type: String(r.service_type),
        match_type: String(r.match_type),
        match_value: String(r.match_value),
        enabled: r.enabled !== false,
        self_pickup_enabled: r.self_pickup_enabled !== false,
        delivery_enabled: r.delivery_enabled !== false,
        internal_rider_enabled: r.internal_rider_enabled !== false,
        tpl_enabled: r.tpl_enabled === true,
        service_radius_meters: r.service_radius_meters == null ? null : Number(r.service_radius_meters),
        dispatch_radius_meters: r.dispatch_radius_meters == null ? null : Number(r.dispatch_radius_meters),
        max_retry_duration_seconds:
          r.max_retry_duration_seconds == null ? null : Number(r.max_retry_duration_seconds),
        strategy: r.strategy == null ? null : String(r.strategy),
        notes: r.notes == null ? null : String(r.notes),
        updated_at: r.updated_at,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load coverage";
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

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const d = parsed.data;
  const matchValue = normalizeMatchValue(d.match_type, d.match_value);
  if (!matchValue) {
    return NextResponse.json({ error: "match_value is required" }, { status: 400 });
  }

  const sql = getSql();
  try {
    const [row] = (await sql`
      INSERT INTO geo_coverage (
        service_type, match_type, match_value, enabled, self_pickup_enabled,
        delivery_enabled, internal_rider_enabled, tpl_enabled, service_radius_meters,
        dispatch_radius_meters, max_retry_duration_seconds, strategy, notes
      )
      VALUES (
        ${d.service_type}, ${d.match_type}, ${matchValue}, ${d.enabled}, ${d.self_pickup_enabled},
        ${d.delivery_enabled}, ${d.internal_rider_enabled}, ${d.tpl_enabled}, ${d.service_radius_meters ?? null},
        ${d.dispatch_radius_meters ?? null}, ${d.max_retry_duration_seconds ?? null}, ${d.strategy ?? null},
        ${d.notes ?? null}
      )
      ON CONFLICT (service_type, match_type, match_value) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        self_pickup_enabled = EXCLUDED.self_pickup_enabled,
        delivery_enabled = EXCLUDED.delivery_enabled,
        internal_rider_enabled = EXCLUDED.internal_rider_enabled,
        tpl_enabled = EXCLUDED.tpl_enabled,
        service_radius_meters = EXCLUDED.service_radius_meters,
        dispatch_radius_meters = EXCLUDED.dispatch_radius_meters,
        max_retry_duration_seconds = EXCLUDED.max_retry_duration_seconds,
        strategy = EXCLUDED.strategy,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING id
    `) as Array<{ id: number }>;

    return NextResponse.json({ ok: true, id: Number(row?.id) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save coverage";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const sql = getSql();
  try {
    await sql`DELETE FROM geo_coverage WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete coverage";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
