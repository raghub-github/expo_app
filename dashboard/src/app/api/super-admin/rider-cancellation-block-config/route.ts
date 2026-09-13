import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";
import {
  getCancellationBlockConfig,
  upsertCancellationBlockConfig,
  CANCELLATION_BLOCK_SERVICES,
} from "@/lib/db/operations/rider-cancellation-block-config";

export const runtime = "nodejs";

/** GET — current per-service cancellation-block config. */
export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const config = await getCancellationBlockConfig();
    return NextResponse.json({ success: true, config });
  } catch (e) {
    console.error("[super-admin rider-cancellation-block-config GET]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

const putSchema = z.object({
  config: z
    .array(
      z.object({
        serviceType: z.enum(CANCELLATION_BLOCK_SERVICES),
        thresholdPct: z.number().min(0).max(100),
        minAccepted: z.number().int().min(0),
        enabled: z.boolean(),
      })
    )
    .min(1),
});

/** PUT — update thresholds. The backend reconciler applies/releases blocks within ~60s. */
export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid config", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let updatedBy = "super_admin";
  try {
    const auth = await getAuthenticatedApiUser(req);
    if (auth.ok && auth.user?.email) updatedBy = auth.user.email;
  } catch {
    /* keep default */
  }

  try {
    await upsertCancellationBlockConfig(parsed.data.config, updatedBy);
    const config = await getCancellationBlockConfig();
    return NextResponse.json({ success: true, config });
  } catch (e) {
    console.error("[super-admin rider-cancellation-block-config PUT]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
