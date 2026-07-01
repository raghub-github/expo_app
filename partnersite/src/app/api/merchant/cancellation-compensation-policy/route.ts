import { NextResponse } from "next/server";
import { client as pgClient } from "@/lib/drizzle";
import { loadMerchantCompensationPolicyDisplay } from "@/lib/merchant-cancellation-compensation-display";

export const runtime = "nodejs";

/** GET — compensation policy bullets for merchant partnersite modal. */
export async function GET() {
  try {
    const policy = await loadMerchantCompensationPolicyDisplay(pgClient);
    if (!policy) {
      return NextResponse.json({ success: false, error: "Engine not configured" }, { status: 404 });
    }
    return NextResponse.json({ success: true, policy });
  } catch (e) {
    console.error("[cancellation-compensation-policy GET]", e);
    return NextResponse.json({ success: false, error: "Failed to load policy" }, { status: 500 });
  }
}
