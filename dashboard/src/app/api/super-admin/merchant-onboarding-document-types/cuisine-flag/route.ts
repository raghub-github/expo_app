import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { setCuisineListEnabled } from "@/lib/db/operations/merchant-onboarding-document-types";

export const runtime = "nodejs";

const schema = z.object({
  storeType: z.string().min(1).max(64),
  cuisineListEnabled: z.boolean(),
});

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
  }
  try {
    const row = await setCuisineListEnabled(parsed.data.storeType, parsed.data.cuisineListEnabled);
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
