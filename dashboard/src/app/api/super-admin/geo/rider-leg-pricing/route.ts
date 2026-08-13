import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  listRiderLegPricing,
  upsertRiderLegPricing,
  type LegUiService,
} from "@/lib/db/operations/rider-leg-pricing-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);
const serviceSchema = z.enum(["food", "parcel", "ride"]);
const vehicleSchema = z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]);

const bodySchema = z.object({
  id: z.number().int().positive().optional().nullable(),
  leg: z.enum(["pre", "post"]),
  level: levelSchema,
  refId: z.string().uuid(),
  service: serviceSchema,
  vehicleType: vehicleSchema.optional().nullable(),
  weightMinKg: z.number().nonnegative().optional().nullable(),
  weightMaxKg: z.number().positive().optional().nullable(),
  minKm: z.number().nonnegative(),
  maxKm: z.number().positive().optional().nullable(),
  baseAmount: z.number().nonnegative().optional().nullable(),
  ratePerKm: z.number().nonnegative(),
  minAmount: z.number().nonnegative().optional().nullable(),
  maxAmount: z.number().nonnegative().optional().nullable(),
  funding: z.enum(["company", "customer", "shared"]),
  customerSharePct: z.number().min(0).max(100).optional(),
  priority: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const level = levelSchema.safeParse(sp.get("level"));
  const refId = sp.get("refId");
  const service = serviceSchema.safeParse(sp.get("service"));
  if (!level.success || !refId || !service.success) {
    return NextResponse.json({ error: "level, refId, service required" }, { status: 400 });
  }
  try {
    const rules = await listRiderLegPricing({
      level: level.data,
      refId,
      service: service.data as LegUiService,
    });
    return NextResponse.json({ rules });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  // Guardrails mirroring the DB CHECK constraints (clearer error than a 500).
  if (d.maxKm != null && d.maxKm <= d.minKm) {
    return NextResponse.json({ error: "maxKm must be greater than minKm" }, { status: 400 });
  }
  if (d.weightMaxKg != null && d.weightMinKg != null && d.weightMaxKg <= d.weightMinKg) {
    return NextResponse.json({ error: "weightMaxKg must be greater than weightMinKg" }, { status: 400 });
  }
  if (d.maxAmount != null && d.minAmount != null && d.maxAmount < d.minAmount) {
    return NextResponse.json({ error: "maxAmount must be >= minAmount" }, { status: 400 });
  }
  if (d.baseAmount != null && d.minKm !== 0) {
    return NextResponse.json({ error: "baseAmount is only allowed on the first (0 km) slab" }, { status: 400 });
  }

  try {
    const row = await upsertRiderLegPricing({
      id: d.id ?? null,
      leg: d.leg,
      level: d.level,
      refId: d.refId,
      service: d.service as LegUiService,
      vehicleType: d.vehicleType ?? null,
      weightMinKg: d.weightMinKg ?? null,
      weightMaxKg: d.weightMaxKg ?? null,
      minKm: d.minKm,
      maxKm: d.maxKm ?? null,
      baseAmount: d.baseAmount ?? null,
      ratePerKm: d.ratePerKm,
      minAmount: d.minAmount ?? null,
      maxAmount: d.maxAmount ?? null,
      funding: d.funding,
      customerSharePct: d.customerSharePct ?? 0,
      priority: d.priority ?? 100,
      isActive: d.isActive ?? true,
    });
    return NextResponse.json({ rule: row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
