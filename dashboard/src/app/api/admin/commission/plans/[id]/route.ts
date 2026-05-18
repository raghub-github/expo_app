/**
 * PATCH /api/admin/commission/plans/:id — set a plan's commission benefit.
 *   { commissionPercentOverride: number|null, benefitActive: boolean, reason?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { updatePlanBenefit } from "@/lib/db/operations/commission";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  const ok = await isSuperAdmin(user.id, user.email!);
  if (!ok) return NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 });
  const sys = await getSystemUserByEmail(user.email!);

  const { id: idStr } = await ctx.params;
  const planId = Number(idStr);
  if (!Number.isInteger(planId) || planId <= 0) {
    return NextResponse.json({ success: false, error: "Invalid plan id" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const benefitActive = Boolean(body.benefitActive);
    let percent: number | null = null;
    if (body.commissionPercentOverride != null && body.commissionPercentOverride !== "") {
      percent = Number(body.commissionPercentOverride);
      if (!Number.isFinite(percent) || percent < 0 || percent >= 100) {
        return NextResponse.json({ success: false, error: "Percent must be in [0,100)" }, { status: 400 });
      }
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;
    await updatePlanBenefit({
      planId,
      commissionPercentOverride: percent,
      benefitActive,
      actorId: sys?.id ?? null,
      reason,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[PATCH /api/admin/commission/plans/:id]", e);
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
