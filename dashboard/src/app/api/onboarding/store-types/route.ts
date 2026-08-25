import { NextResponse } from "next/server";
import { listAcceptanceStoreTypes } from "@/lib/db/operations/merchant-onboarding-document-types";

export const runtime = "nodejs";

/** Public catalog for child/parent onboarding — same types as super-admin Merchant docs, minus RIDER. */
export async function GET() {
  try {
    const storeTypes = await listAcceptanceStoreTypes();
    return NextResponse.json({ success: true, storeTypes });
  } catch (e) {
    console.warn("[onboarding store-types] error:", e);
    return NextResponse.json({ success: true, storeTypes: [] });
  }
}
