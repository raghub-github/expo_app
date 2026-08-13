import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  listDynamicPricingRules,
  upsertDynamicPricingRule,
  type DynServiceDb,
} from "@/lib/db/operations/dynamic-pricing-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);
// UI services (ride ↔ person_ride) + 'all'
const serviceSchema = z.enum(["food", "parcel", "ride", "all"]);

function toDbService(s: "food" | "parcel" | "ride" | "all"): DynServiceDb {
  return s === "ride" ? "person_ride" : s;
}

const vehicleSchema = z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]);

const bodySchema = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
  service: serviceSchema,
  mode: z.enum(["NIGHT", "RAIN", "PEAK", "FESTIVAL", "HOLIDAY", "HIGH_DEMAND", "LOW_SUPPLY", "MANUAL"]),
  /** NULL/omitted = applies to all vehicles. Only meaningful for ride/parcel. */
  vehicleType: vehicleSchema.nullable().optional(),
  name: z.string().max(120).nullable().optional(),
  valueType: z.enum(["FIXED", "PER_KM", "PERCENTAGE", "MULTIPLIER"]),
  value: z.number().nonnegative(),
  maxAmount: z.number().nonnegative().nullable().optional(),
  funding: z.enum(["customer", "company", "shared"]).default("customer"),
  customerSharePct: z.number().min(0).max(100).default(100),
  taxable: z.boolean().default(false),
  gstRate: z.number().min(0).max(1).default(0),
  allDay: z.boolean().default(false),
  startTime: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/).nullable().optional(),
  endTime: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/).nullable().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  activeFrom: z.string().datetime().nullable().optional(),
  activeTo: z.string().datetime().nullable().optional(),
  manualActive: z.boolean().default(false),
  priority: z.number().int().nonnegative().default(100),
  isActive: z.boolean().default(true),
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
    const rules = await listDynamicPricingRules({
      level: level.data,
      refId,
      service: toDbService(service.data),
    });
    return NextResponse.json({ rules });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  if (d.maxAmount != null && d.value > 0 && d.valueType === "FIXED" && d.maxAmount < d.value) {
    return NextResponse.json({ error: "maxAmount must be >= a FIXED value" }, { status: 400 });
  }
  if (d.funding === "shared" && (d.customerSharePct <= 0 || d.customerSharePct >= 100)) {
    return NextResponse.json({ error: "customerSharePct must be 0–100 (exclusive) for shared funding" }, { status: 400 });
  }
  if (!d.allDay && d.mode !== "MANUAL" && (!d.startTime || !d.endTime) && (!d.daysOfWeek || d.daysOfWeek.length === 0) && !d.activeFrom) {
    return NextResponse.json({ error: "Set a time window (all-day, start/end, days, or a date range) — or use MANUAL." }, { status: 400 });
  }
  if (d.service === "food" && d.vehicleType) {
    return NextResponse.json({ error: "Food has no vehicle dimension — leave vehicle unset." }, { status: 400 });
  }

  try {
    const rule = await upsertDynamicPricingRule({
      level: d.level,
      refId: d.refId,
      service: toDbService(d.service),
      mode: d.mode,
      vehicleType: d.vehicleType ?? null,
      name: d.name ?? null,
      valueType: d.valueType,
      value: d.value,
      maxAmount: d.maxAmount ?? null,
      funding: d.funding,
      customerSharePct: d.funding === "shared" ? d.customerSharePct : 100,
      taxable: d.taxable,
      gstRate: d.taxable ? d.gstRate : 0,
      allDay: d.allDay,
      startTime: d.startTime ?? null,
      endTime: d.endTime ?? null,
      daysOfWeek: d.daysOfWeek ?? null,
      activeFrom: d.activeFrom ?? null,
      activeTo: d.activeTo ?? null,
      manualActive: d.manualActive,
      priority: d.priority,
      isActive: d.isActive,
    });
    return NextResponse.json({ rule });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
}
