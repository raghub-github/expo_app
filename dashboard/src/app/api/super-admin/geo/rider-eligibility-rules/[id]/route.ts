import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getRiderEligibilityRuleById,
  softDeleteRiderEligibilityRule,
  updateRiderEligibilityRule,
} from "@/lib/db/operations/rider-eligibility-rules-admin";

export const runtime = "nodejs";

const patchSchema = z.object({
  serviceEnabled: z.boolean().optional(),
  dlRequirement: z.enum(["required", "optional", "exempt"]).optional(),
  rcRequirement: z.enum(["required", "optional", "exempt"]).optional(),
  commercialRequired: z.boolean().optional(),
  allowedVehicleClasses: z.array(z.enum(["2_wheeler", "3_wheeler", "4_wheeler"])).optional(),
  allowedFuelKinds: z.array(z.string().trim().toLowerCase()).optional(),
  allowedOwnership: z.array(z.enum(["commercial", "non_commercial"])).optional(),
  priority: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

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
  const p = parsed.data;

  try {
    const current = await getRiderEligibilityRuleById(id);
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const merged = {
      serviceEnabled: p.serviceEnabled ?? current.serviceEnabled,
      dlRequirement: p.dlRequirement ?? current.dlRequirement,
      rcRequirement: p.rcRequirement ?? current.rcRequirement,
      commercialRequired: p.commercialRequired ?? current.commercialRequired,
      allowedVehicleClasses: p.allowedVehicleClasses ?? current.allowedVehicleClasses,
      allowedFuelKinds: p.allowedFuelKinds ?? current.allowedFuelKinds,
      allowedOwnership: p.allowedOwnership ?? current.allowedOwnership,
      priority: p.priority ?? current.priority,
      isActive: p.isActive ?? current.isActive,
      effectiveFrom: p.effectiveFrom === undefined ? current.effectiveFrom : p.effectiveFrom,
      effectiveTo: p.effectiveTo === undefined ? current.effectiveTo : p.effectiveTo,
    };

    if (
      current.serviceType === "food" &&
      merged.allowedVehicleClasses.some((c) => c !== "2_wheeler")
    ) {
      return NextResponse.json(
        { error: "Food is 2-wheeler only — allowedVehicleClasses may contain only 2_wheeler." },
        { status: 400 }
      );
    }

    const rule = await updateRiderEligibilityRule(id, merged);
    if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ rule });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  try {
    const ok = await softDeleteRiderEligibilityRule(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}
