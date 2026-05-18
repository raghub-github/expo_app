/**
 * DELETE /api/admin/commission/stores/:id/rules/:ruleId — deactivate a rule.
 * Soft-delete: sets is_active=false and writes RULE_DEACTIVATED to the audit log.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { deactivateStoreRule } from "@/lib/db/operations/commission";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; ruleId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  const ok = await isSuperAdmin(user.id, user.email!);
  if (!ok) return NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 });
  const sys = await getSystemUserByEmail(user.email!);

  const { ruleId: ruleIdStr } = await ctx.params;
  const ruleId = Number(ruleIdStr);
  if (!Number.isInteger(ruleId) || ruleId <= 0) {
    return NextResponse.json({ success: false, error: "Invalid rule id" }, { status: 400 });
  }
  let reason: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.reason === "string" && body.reason.trim()) reason = body.reason.trim();
  } catch {}

  try {
    await deactivateStoreRule(ruleId, sys?.id ?? null, reason);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DELETE /api/admin/commission/stores/:id/rules/:ruleId]", e);
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
