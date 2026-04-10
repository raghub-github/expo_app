import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { insertGeoPricingRule, listGeoPricingRules } from "@/lib/db/operations/geo-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);
const serviceSchema = z.enum(["food", "parcel", "ride"]);

const postSchema = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
  service: serviceSchema,
  ruleType: z.string().min(1),
  valueNumeric: z.number().optional().nullable(),
  valueJson: z.unknown().optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const level = levelSchema.safeParse(sp.get("level"));
  const refId = sp.get("refId");
  if (!level.success || !refId) {
    return NextResponse.json({ error: "level and refId required" }, { status: 400 });
  }

  try {
    const rules = await listGeoPricingRules(level.data, refId);
    return NextResponse.json({ rules });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list rules";
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
    const rule = await insertGeoPricingRule({
      level: parsed.data.level,
      refId: parsed.data.refId,
      service: parsed.data.service,
      ruleType: parsed.data.ruleType,
      valueNumeric: parsed.data.valueNumeric,
      valueJson: parsed.data.valueJson,
      priority: parsed.data.priority,
      isActive: parsed.data.isActive,
    });
    return NextResponse.json({ rule });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Insert failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
