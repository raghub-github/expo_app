import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { insertTaxConfig, listTaxConfigs } from "@/lib/db/operations/billing-reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreJson = { headers: { "Cache-Control": "no-store, must-revalidate" } } as const;

const postSchema = z.object({
  name: z.string().min(1),
  rate: z.number(),
  applicable_base: z.string().min(1),
  tax_group: z.string().nullable().optional(),
  priority: z.number().int().optional(),
  is_active: z.boolean().optional(),
  is_hidden: z.boolean().optional(),
  service_type: z.string().optional(),
  metadata: z.unknown().optional(),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const taxConfigs = await listTaxConfigs();
    return NextResponse.json({ taxConfigs }, noStoreJson);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500, ...noStoreJson });
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
    const taxConfig = await insertTaxConfig(parsed.data);
    return NextResponse.json({ taxConfig });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const conflict =
      msg.includes("already exists for service") || msg.includes("duplicate key value");
    return NextResponse.json({ error: msg }, { status: conflict ? 409 : 500 });
  }
}
