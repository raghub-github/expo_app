import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertRiderOnboardingVehicleType,
  listRiderOnboardingVehicleTypes,
} from "@/lib/db/operations/rider-onboarding-vehicle-types";

export const runtime = "nodejs";

const docRequirementsSchema = z.object({
  required_docs: z.array(z.string()).optional(),
  optional_docs: z.array(z.string()).optional(),
  has_own_vehicle: z.boolean().optional(),
  requires_max_speed: z.boolean().optional(),
});

const postSchema = z.object({
  code: z.string().min(1).max(64),
  categoryCode: z.string().max(64).optional().nullable(),
  label: z.string().min(1).max(200),
  hint: z.string().max(500).optional().nullable(),
  icon: z.string().max(64).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  onboardingFlow: z.enum(["dl_rc", "rental_ev", "payment"]),
  documentRequirements: docRequirementsSchema.optional(),
  infoMessage: z.string().max(1000).optional().nullable(),
  mapsToVehicleType: z.string().max(64).optional().nullable(),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const rows = await listRiderOnboardingVehicleTypes({ activeOnly: false });
    return NextResponse.json({ success: true, rows });
  } catch (e) {
    console.error("[super-admin rider-onboarding-vehicle-types GET]", e);
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const row = await insertRiderOnboardingVehicleType({
      code: parsed.data.code.trim().toLowerCase().replace(/\s+/g, "_"),
      categoryCode: parsed.data.categoryCode,
      label: parsed.data.label,
      hint: parsed.data.hint,
      icon: parsed.data.icon,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive,
      onboardingFlow: parsed.data.onboardingFlow,
      documentRequirements: parsed.data.documentRequirements,
      infoMessage: parsed.data.infoMessage,
      mapsToVehicleType: parsed.data.mapsToVehicleType,
    });
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create";
    const status = msg.includes("unique") || msg.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
