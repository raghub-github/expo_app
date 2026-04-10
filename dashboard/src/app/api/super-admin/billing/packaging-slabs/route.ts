import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { insertPackagingSlab, listPackagingSlabs } from "@/lib/db/operations/billing-reference";

export const runtime = "nodejs";

const postSchema = z.object({
  name: z.string().optional().nullable(),
  min_cart: z.number().nullable().optional(),
  max_cart: z.number().nullable().optional(),
  fee_fixed: z.number().optional(),
  fee_per_addon_qty: z.number().optional(),
  scope_type: z.string().optional(),
  scope_id: z.number().nullable().optional(),
  priority: z.number().int().optional(),
  is_active: z.boolean().optional(),
  metadata: z.unknown().optional(),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const slabs = await listPackagingSlabs();
    return NextResponse.json({ slabs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const slab = await insertPackagingSlab(parsed.data);
    return NextResponse.json({ slab });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
