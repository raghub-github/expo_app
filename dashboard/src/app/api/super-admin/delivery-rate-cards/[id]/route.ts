import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  deleteDeliveryRateCard,
  getDeliveryRateCardFull,
  updateDeliveryRateCardFull,
} from "@/lib/db/operations/delivery-rate-card-admin";

export const runtime = "nodejs";

const slabSchema = z.object({
  min_km: z.number().nullable().optional(),
  max_km: z.number().nullable().optional(),
  base_fare: z.number().optional(),
  per_km_rate: z.number().optional(),
  priority: z.number().int().optional(),
  metadata: z.unknown().optional(),
});
const timeSlotSchema = z.object({
  start_min: z.number().int().min(0).max(1439),
  end_min: z.number().int().min(0).max(1439),
  surge_multiplier: z.number().optional(),
  is_weekend_only: z.boolean().optional(),
  metadata: z.unknown().optional(),
});
const zoneSchema = z.object({
  zone_name: z.string().nullable().optional(),
  geojson: z.unknown(),
  multiplier: z.number().optional(),
  priority: z.number().int().optional(),
  is_active: z.boolean().optional(),
  metadata: z.unknown().optional(),
});

const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    service_type: z.string().min(1).optional(),
    city_name: z.string().nullable().optional(),
    priority: z.number().int().optional(),
    is_active: z.boolean().optional(),
    metadata: z.unknown().optional(),
    slabs: z.array(slabSchema).optional(),
    time_slots: z.array(timeSlotSchema).optional(),
    zones: z.array(zoneSchema).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field required" });

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const card = await getDeliveryRateCardFull(id);
    if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ card });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const existing = await getDeliveryRateCardFull(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const merged = {
      name: parsed.data.name ?? existing.name,
      service_type: parsed.data.service_type ?? existing.service_type,
      city_name: parsed.data.city_name !== undefined ? parsed.data.city_name : existing.city_name,
      priority: parsed.data.priority ?? existing.priority,
      is_active: parsed.data.is_active ?? existing.is_active,
      metadata: parsed.data.metadata !== undefined ? parsed.data.metadata : existing.metadata,
      slabs: parsed.data.slabs ?? existing.slabs?.map((s) => ({
        min_km: s.min_km != null ? parseFloat(s.min_km) : null,
        max_km: s.max_km != null ? parseFloat(s.max_km) : null,
        base_fare: parseFloat(s.base_fare),
        per_km_rate: parseFloat(s.per_km_rate),
        priority: s.priority,
        metadata: s.metadata,
      })),
      time_slots: parsed.data.time_slots ?? existing.time_slots?.map((t) => ({
        start_min: t.start_min,
        end_min: t.end_min,
        surge_multiplier: parseFloat(t.surge_multiplier),
        is_weekend_only: t.is_weekend_only,
        metadata: t.metadata,
      })),
      zones: parsed.data.zones ?? existing.zones?.map((z) => ({
        zone_name: z.zone_name,
        geojson: z.geojson,
        multiplier: parseFloat(z.multiplier),
        priority: z.priority,
        is_active: z.is_active,
        metadata: z.metadata,
      })),
    };
    await updateDeliveryRateCardFull(id, merged);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const ok = await deleteDeliveryRateCard(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

