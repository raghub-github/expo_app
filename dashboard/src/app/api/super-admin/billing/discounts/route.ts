import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { insertDiscount, listDiscounts } from "@/lib/db/operations/billing-reference";

export const runtime = "nodejs";

const postSchema = z.object({
  code: z.string().min(1),
  discount_type: z.enum(["FIXED", "PERCENTAGE"]),
  value_numeric: z.number().nullable().optional(),
  max_discount_cap: z.number().nullable().optional(),
  usage_limit: z.number().int().nullable().optional(),
  is_active: z.boolean().optional(),
  is_hidden: z.boolean().optional(),
  metadata: z.unknown().optional(),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const discounts = await listDiscounts();
    return NextResponse.json({ discounts });
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
    const discount = await insertDiscount(parsed.data);
    return NextResponse.json({ discount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
