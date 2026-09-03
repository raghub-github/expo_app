import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertRiderEligibilityRule,
  listRiderEligibilityRules,
  type EligibilityService,
} from "@/lib/db/operations/rider-eligibility-rules-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);
const serviceSchema = z.enum(["food", "parcel", "person_ride"]);
const docReqSchema = z.enum(["required", "optional", "exempt"]);
const vehicleClassSchema = z.enum(["2_wheeler", "3_wheeler", "4_wheeler"]);
const ownershipSchema = z.enum(["commercial", "non_commercial"]);

const ruleBodySchema = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
  service: serviceSchema,
  serviceEnabled: z.boolean().optional(),
  dlRequirement: docReqSchema.optional(),
  rcRequirement: docReqSchema.optional(),
  commercialRequired: z.boolean().optional(),
  allowedVehicleClasses: z.array(vehicleClassSchema).optional(),
  allowedFuelKinds: z.array(z.string().trim().toLowerCase()).optional(),
  allowedOwnership: z.array(ownershipSchema).optional(),
  priority: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
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
    const rules = await listRiderEligibilityRules({
      level: level.data,
      refId,
      service: service.data as EligibilityService,
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

  const parsed = ruleBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  // Food is 2-wheeler only — reject an obviously contradictory config early.
  if (d.service === "food" && d.allowedVehicleClasses && d.allowedVehicleClasses.some((c) => c !== "2_wheeler")) {
    return NextResponse.json(
      { error: "Food is 2-wheeler only — allowedVehicleClasses may contain only 2_wheeler." },
      { status: 400 }
    );
  }

  try {
    const rule = await insertRiderEligibilityRule({
      level: d.level,
      refId: d.refId,
      service: d.service as EligibilityService,
      serviceEnabled: d.serviceEnabled ?? true,
      dlRequirement: d.dlRequirement ?? "required",
      rcRequirement: d.rcRequirement ?? (d.service === "food" ? "optional" : "required"),
      commercialRequired: d.commercialRequired ?? (d.service === "person_ride"),
      allowedVehicleClasses:
        d.allowedVehicleClasses ?? (d.service === "food" ? ["2_wheeler"] : ["2_wheeler", "3_wheeler", "4_wheeler"]),
      allowedFuelKinds: d.allowedFuelKinds ?? [],
      allowedOwnership: d.allowedOwnership ?? ["commercial", "non_commercial"],
      priority: d.priority ?? 100,
      isActive: d.isActive ?? true,
      effectiveFrom: d.effectiveFrom ?? null,
      effectiveTo: d.effectiveTo ?? null,
    });
    return NextResponse.json({ rule });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Insert failed" }, { status: 500 });
  }
}
