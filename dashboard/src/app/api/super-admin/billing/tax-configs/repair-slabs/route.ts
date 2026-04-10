import { NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { repairMissingTaxSlabs } from "@/lib/db/operations/billing-reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreJson = { headers: { "Cache-Control": "no-store, must-revalidate" } } as const;

/** Explicitly create missing TAX rows in billing_pricing_rules for orphan billing_tax_configs. */
export async function POST() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const result = await repairMissingTaxSlabs();
    return NextResponse.json(result, noStoreJson);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Repair failed";
    return NextResponse.json({ error: msg }, { status: 500, ...noStoreJson });
  }
}
