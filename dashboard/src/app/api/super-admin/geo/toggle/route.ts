import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { geoToggleService } from "@/lib/db/operations/geo-admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  level: z.enum(["state", "region", "district", "division", "post_office", "pincode"]),
  id: z.string().uuid(),
  service: z.enum(["food", "parcel", "ride"]),
  value: z.boolean(),
});

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
    await geoToggleService(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Toggle failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
