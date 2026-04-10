import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertDeliveryRateCardFull,
  listDeliveryRateCards,
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

const postSchema = z.object({
  name: z.string().min(1),
  service_type: z.string().min(1),
  city_name: z.string().nullable().optional(),
  priority: z.number().int().optional(),
  is_active: z.boolean().optional(),
  metadata: z.unknown().optional(),
  slabs: z.array(slabSchema).optional(),
  time_slots: z.array(timeSlotSchema).optional(),
  zones: z.array(zoneSchema).optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const url = new URL(req.url);
  const serviceType = url.searchParams.get("serviceType") ?? undefined;
  try {
    const cards = await listDeliveryRateCards(serviceType);
    return NextResponse.json({ cards });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const id = await insertDeliveryRateCardFull(parsed.data);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

