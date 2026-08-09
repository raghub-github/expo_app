import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  deleteGeoPrePickupOverride,
  getEffectiveGeoPrePickup,
  getGeoPrePickupOverride,
  upsertGeoPrePickupOverride,
  type PrePickupServiceType,
} from "@/lib/db/operations/pre-pickup-compensation-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);
// UI services; mapped to DB order_type below (ride -> person_ride).
const serviceSchema = z.enum(["food", "parcel", "ride"]);

function toDbService(s: "food" | "parcel" | "ride"): PrePickupServiceType {
  return s === "ride" ? "person_ride" : s;
}

const putSchema = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
  service: serviceSchema,
  ratePerKm: z.number().nonnegative(),
  funding: z.enum(["company", "customer", "shared"]).default("company"),
  customerSharePct: z.number().min(0).max(100).default(0),
  minAmount: z.number().nonnegative().nullable().optional(),
  maxAmount: z.number().nonnegative().nullable().optional(),
  priority: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.string().datetime().nullable().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
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

  const dbService = toDbService(service.data);
  try {
    const [override, effective] = await Promise.all([
      getGeoPrePickupOverride({ level: level.data, refId, service: dbService }),
      getEffectiveGeoPrePickup({ level: level.data, refId, service: dbService }),
    ]);
    return NextResponse.json({
      override,
      effective: effective.row,
      effectiveApplied: effective.applied,
      // true when the effective row is inherited from an ancestor, not this exact node
      inherited: Boolean(
        effective.row &&
          (effective.applied?.level !== level.data || effective.applied?.refId !== refId)
      ),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
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

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  if (d.minAmount != null && d.maxAmount != null && d.maxAmount < d.minAmount) {
    return NextResponse.json({ error: "maxAmount must be >= minAmount" }, { status: 400 });
  }
  if (d.funding === "shared" && (d.customerSharePct <= 0 || d.customerSharePct >= 100)) {
    return NextResponse.json(
      { error: "customerSharePct must be between 0 and 100 (exclusive) when funding is shared" },
      { status: 400 }
    );
  }

  try {
    const row = await upsertGeoPrePickupOverride({
      level: d.level,
      refId: d.refId,
      service: toDbService(d.service),
      ratePerKm: d.ratePerKm,
      funding: d.funding,
      customerSharePct: d.funding === "shared" ? d.customerSharePct : 0,
      minAmount: d.minAmount ?? null,
      maxAmount: d.maxAmount ?? null,
      priority: d.priority ?? 100,
      isActive: d.isActive ?? true,
      effectiveFrom: d.effectiveFrom ?? null,
      effectiveTo: d.effectiveTo ?? null,
    });
    return NextResponse.json({ override: row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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
    const ok = await deleteGeoPrePickupOverride({
      level: level.data,
      refId,
      service: toDbService(service.data),
    });
    if (!ok) return NextResponse.json({ error: "No override at this node" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}
