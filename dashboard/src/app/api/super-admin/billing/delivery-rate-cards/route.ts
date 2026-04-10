import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { insertDeliveryRateCard, listDeliveryRateCards } from "@/lib/db/operations/billing-advanced";

export const runtime = "nodejs";

const postSchema = z.object({
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
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const cards = await listDeliveryRateCards();
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
    const card = await insertDeliveryRateCard(parsed.data);
    return NextResponse.json({ card });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
