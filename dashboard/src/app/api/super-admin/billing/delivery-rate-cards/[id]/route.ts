import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  deleteDeliveryRateCard,
  listDeliveryRateCards,
  updateDeliveryRateCard,
} from "@/lib/db/operations/billing-advanced";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    name: z.string().optional().nullable(),
    service_type: z.string().optional(),
    city_name: z.string().optional().nullable(),
    time_slot: z.string().optional().nullable(),
    base_fare: z.number().optional(),
    per_km_rate: z.number().optional(),
    surge_multiplier: z.number().optional(),
    min_km: z.number().nullable().optional(),
    max_km: z.number().nullable().optional(),
    free_delivery_above: z.number().nullable().optional(),
    priority: z.number().int().optional(),
    is_active: z.boolean().optional(),
    metadata: z.unknown().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field required" });

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
    const existing = await listDeliveryRateCards();
    const row0 = existing.find((c) => c.id === id);
    if (!row0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const merged = {
      name: parsed.data.name ?? row0.name,
      service_type: parsed.data.service_type ?? row0.service_type,
      city_name: parsed.data.city_name !== undefined ? parsed.data.city_name : row0.city_name,
      time_slot: parsed.data.time_slot !== undefined ? parsed.data.time_slot : row0.time_slot,
      base_fare: parsed.data.base_fare ?? parseFloat(row0.base_fare || "0"),
      per_km_rate: parsed.data.per_km_rate ?? parseFloat(row0.per_km_rate || "0"),
      surge_multiplier: parsed.data.surge_multiplier ?? parseFloat(row0.surge_multiplier || "1"),
      min_km: parsed.data.min_km !== undefined ? parsed.data.min_km : row0.min_km != null ? parseFloat(row0.min_km) : null,
      max_km: parsed.data.max_km !== undefined ? parsed.data.max_km : row0.max_km != null ? parseFloat(row0.max_km) : null,
      free_delivery_above:
        parsed.data.free_delivery_above !== undefined
          ? parsed.data.free_delivery_above
          : row0.free_delivery_above != null
            ? parseFloat(row0.free_delivery_above)
            : null,
      priority: parsed.data.priority ?? row0.priority,
      is_active: parsed.data.is_active ?? row0.is_active,
      metadata: parsed.data.metadata !== undefined ? parsed.data.metadata : row0.metadata,
    };
    const card = await updateDeliveryRateCard(id, merged);
    if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ card });
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
