import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { geoSetRiderOnlineCheck } from "@/lib/db/operations/geo-admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  id: z.string().uuid(),
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
    const result = await geoSetRiderOnlineCheck({ stateId: parsed.data.id, value: parsed.data.value });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Toggle failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
