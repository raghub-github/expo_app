/**
 * GET /api/public/store-onboarding-commission-config
 * Read-only config for merchant store registration (Commission plan step). No auth.
 */
import { NextResponse } from "next/server";
import { getStoreOnboardingCommissionConfig } from "@/lib/db/operations/store-onboarding-commission-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getStoreOnboardingCommissionConfig();
    if (!config) {
      return NextResponse.json(
        { success: false, error: "Config not available" },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: true, config });
  } catch (e) {
    console.error("[GET /api/public/store-onboarding-commission-config]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
