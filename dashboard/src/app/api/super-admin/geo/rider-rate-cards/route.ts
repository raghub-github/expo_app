import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { listRiderRateCardsByLevel, upsertRiderRateCardDb } from "@/lib/db/operations/geo-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);
const serviceSchema = z.enum(["food", "parcel", "ride"]);

const upsertSchema = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
  service: serviceSchema,
  baseFare: z.coerce.number().finite(),
  perKmRate: z.coerce.number().finite(),
  minDistanceKm: z.coerce.number().finite().min(0).default(0),
  maxDistanceKm: z.coerce.number().finite().positive().nullable().optional(),
  waitingChargePerMin: z.coerce.number().finite().min(0).default(0),
  surgeMultiplier: z.coerce.number().finite().positive().default(1),
  priority: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
  override: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const level = levelSchema.safeParse(sp.get("level"));
  const refId = sp.get("refId");
  if (!level.success || !refId) {
    return NextResponse.json({ error: "level and refId required" }, { status: 400 });
  }

  const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;
  const offset = sp.get("offset") ? Number(sp.get("offset")) : undefined;

  try {
    const cards = await listRiderRateCardsByLevel({
      level: level.data,
      refId,
      limit,
      offset,
    });
    return NextResponse.json({ cards });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list rider rate cards";
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

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const card = await upsertRiderRateCardDb({
      level: parsed.data.level,
      refId: parsed.data.refId,
      service: parsed.data.service,
      baseFare: parsed.data.baseFare,
      perKmRate: parsed.data.perKmRate,
      minDistanceKm: parsed.data.minDistanceKm,
      maxDistanceKm: parsed.data.maxDistanceKm ?? null,
      waitingChargePerMin: parsed.data.waitingChargePerMin,
      surgeMultiplier: parsed.data.surgeMultiplier,
      priority: parsed.data.priority,
      isActive: parsed.data.isActive,
      override: parsed.data.override,
    });
    return NextResponse.json({ card });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upsert failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
