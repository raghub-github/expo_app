import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getMerchantOverride, upsertMerchantOverride } from "@/lib/db/operations/billing-reference";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const storeId = req.nextUrl.searchParams.get("merchantStoreId");
  const id = storeId ? parseInt(storeId, 10) : NaN;
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "merchantStoreId query required" }, { status: 400 });
  }
  try {
    const row = await getMerchantOverride(id);
    return NextResponse.json({ override: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const putSchema = z.object({
  merchant_store_id: z.number().int().positive(),
  overrides: z.record(z.string(), z.any()),
});

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    await upsertMerchantOverride(parsed.data.merchant_store_id, parsed.data.overrides);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
