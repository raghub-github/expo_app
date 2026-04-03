import { NextResponse } from "next/server";
import { getStoreOnboardingCommissionConfig } from "@/lib/store-onboarding-commission-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/public/store-onboarding-commission-config
 * Read-only; used by register-store commission plan step.
 */
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
