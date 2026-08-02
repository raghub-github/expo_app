import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getRiderAutoCancelConfig,
  saveRiderAutoCancelConfig,
} from "@/lib/db/operations/rider-auto-cancel-config";

export const runtime = "nodejs";

const serviceEnum = z.enum(["food", "parcel", "person_ride"]);
const phaseEnum = z.enum(["pre_pickup", "post_pickup"]);

const patchSchema = z.object({
  services: z
    .array(
      z.object({
        serviceType: serviceEnum,
        phase: phaseEnum.optional(),
        isEnabled: z.boolean().optional(),
        penaltyAmount: z.coerce.number().min(0).optional(),
        oppositeDirectionKm: z.coerce.number().min(0).optional(),
        noMovementMinutes: z.coerce.number().int().min(0).optional(),
        locationOffMinutes: z.coerce.number().int().min(0).optional(),
        routeDeviationM: z.coerce.number().int().min(0).optional(),
        enableLocationOffRule: z.boolean().optional(),
        enableNoMovementRule: z.boolean().optional(),
        enableOppositeDirectionRule: z.boolean().optional(),
        enableRouteDeviationRule: z.boolean().optional(),
        warningIntervalMinutes: z.coerce.number().int().min(1).max(60).optional(),
        graceMinutes: z.coerce.number().int().min(0).max(60).optional(),
        ledgerTitle: z.string().max(500).optional(),
        ledgerDescription: z.string().max(2000).optional(),
        reasonCode: z.string().max(120).nullable().optional(),
      })
    )
    .min(1),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const payload = await getRiderAutoCancelConfig("pre_pickup");
    return NextResponse.json({ success: true, ...payload });
  } catch (e) {
    console.error("[super-admin rider-auto-cancel-penalties GET]", e);
    const msg = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const payload = await saveRiderAutoCancelConfig({
      services: parsed.data.services,
      updatedBy: "super_admin",
    });
    return NextResponse.json({ success: true, ...payload });
  } catch (e) {
    console.error("[super-admin rider-auto-cancel-penalties PATCH]", e);
    const msg = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
