import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logBillingCharge } from "@/lib/billing-charge-order";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { reorderBillingChargeOrder } from "@/lib/db/operations/billing-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ordered: z.array(
    z.object({
      kind: z.enum(["rule", "tax"]),
      id: z.coerce.number().int().positive(),
    })
  ),
});

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) {
    logBillingCharge("POST /charge-order", "blocked by auth", { status: gate.response.status });
    return gate.response;
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    logBillingCharge("POST /charge-order", "validation failed", {
      issueCount: parsed.error.issues.length,
    });
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const { ordered } = parsed.data;
  if (ordered.length === 0) {
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  }
  logBillingCharge("POST /charge-order", "persist start", {
    n: ordered.length,
    head: ordered.slice(0, 6).map((r) => `${r.kind}:${r.id}`).join(","),
  });
  try {
    await reorderBillingChargeOrder(ordered);
    logBillingCharge("POST /charge-order", "persist ok", { n: ordered.length });
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to reorder";
    console.error("[POST /api/super-admin/billing/charge-order]", e);
    logBillingCharge("POST /charge-order", "persist error", { message: String(msg).slice(0, 300) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
