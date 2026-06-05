import { NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { listRiderOnboardingVehicleCategories } from "@/lib/db/operations/rider-onboarding-vehicle-categories";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const rows = await listRiderOnboardingVehicleCategories({ activeOnly: false });
    return NextResponse.json({ success: true, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
