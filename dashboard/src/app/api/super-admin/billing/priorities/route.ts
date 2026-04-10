import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { updateBillingRulePriorities } from "@/lib/db/operations/billing-admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  orderedIds: z.array(z.number().int().positive()),
});

export async function PATCH(req: NextRequest) {
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
    await updateBillingRulePriorities(parsed.data.orderedIds);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update priorities";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
