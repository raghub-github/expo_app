import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertGeoBillingDiscountBinding,
  listGeoBillingDiscountBindingsForNode,
} from "@/lib/db/operations/geo-admin";
import type { GeoHierarchyLevel } from "@/lib/geo/geo-shared";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);

const postBody = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
  billing_discount_id: z.number().int().positive(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const level = levelSchema.safeParse(sp.get("level"));
  const refId = sp.get("refId");
  if (!level.success || !refId || !z.string().uuid().safeParse(refId).success) {
    return NextResponse.json({ error: "level and refId (uuid) required" }, { status: 400 });
  }

  try {
    const bindings = await listGeoBillingDiscountBindingsForNode(
      level.data as Exclude<GeoHierarchyLevel, "root">,
      refId
    );
    return NextResponse.json({ bindings });
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
  const parsed = postBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const binding = await insertGeoBillingDiscountBinding({
      level: parsed.data.level,
      refId: parsed.data.refId,
      billingDiscountId: parsed.data.billing_discount_id,
    });
    return NextResponse.json({ binding });
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code?: string }).code) : "";
    if (code === "23505") {
      return NextResponse.json({ error: "This coupon is already mapped at this location." }, { status: 409 });
    }
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
