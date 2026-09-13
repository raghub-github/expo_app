import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  listRiderGeoIdentityMethods,
  upsertRiderGeoIdentityMethods,
} from "@/lib/db/operations/rider-geo-identity-methods-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);

const bodySchema = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
  digilockerEnabled: z.boolean().optional(),
  aadhaarMaskingEnabled: z.boolean().optional(),
  manualUploadEnabled: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const level = levelSchema.safeParse(sp.get("level"));
  const refId = sp.get("refId");
  if (!level.success || !refId) {
    return NextResponse.json({ error: "level, refId required" }, { status: 400 });
  }
  try {
    const rows = await listRiderGeoIdentityMethods({ level: level.data, refId });
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const row = await upsertRiderGeoIdentityMethods(parsed.data);
    return NextResponse.json({ row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
