import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { insertBillingRule, listBillingRules } from "@/lib/db/operations/billing-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreJson = { headers: { "Cache-Control": "no-store, must-revalidate" } } as const;

function httpErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

const postSchema = z.object({
  name: z.string().optional().nullable(),
  type: z.string().min(1),
  calculation_type: z.string().min(1),
  value_numeric: z.number().nullable().optional(),
  value_json: z.unknown().optional(),
  priority: z.number().optional(),
  is_active: z.boolean().optional(),
  stackable: z.boolean().optional(),
  applies_to: z.string().optional(),
  offer_owner: z.string().optional(),
  is_hidden: z.boolean().optional(),
  metadata: z.unknown().optional(),
  service_type: z.string().optional(),
  discount_applies_on: z.string().optional(),
  charge_subtype: z.string().nullable().optional(),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const rules = await listBillingRules();
    return NextResponse.json({ rules }, noStoreJson);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list rules";
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
    const row = await insertBillingRule(parsed.data);
    return NextResponse.json({ rule: row });
  } catch (e) {
    const msg = httpErrorMessage(e);
    const conflict =
      msg.includes("already exists for this service scope") ||
      msg.includes("Priority") ||
      msg.includes("already used") ||
      msg.includes("duplicate key") ||
      msg.includes("unique constraint");
    if (process.env.NODE_ENV === "development") {
      console.error("[POST /api/super-admin/billing/rules]", e);
    }
    return NextResponse.json({ error: msg }, { status: conflict ? 409 : 500 });
  }
}
