import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { pausePreventServiceRule } from "@/lib/db/operations/prevent-services-admin";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let reason: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.reason === "string") reason = body.reason;
  } catch {
    /* optional */
  }

  try {
    const rule = await pausePreventServiceRule({
      id,
      adminId: user?.id ?? null,
      adminName: user?.user_metadata?.full_name || user?.email || null,
      reason,
    });
    return NextResponse.json({ ok: true, rule });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Pause failed";
    const status =
      e && typeof e === "object" && "statusCode" in e
        ? Number((e as { statusCode?: number }).statusCode) || 500
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
