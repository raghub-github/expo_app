/**
 * GET   /api/admin/commission/plans       — list active plans + their commission benefit.
 * PATCH /api/admin/commission/plans/:id   — see ./[id]/route.ts.
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { listPlansForBenefitEditor } from "@/lib/db/operations/commission";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  const ok = await isSuperAdmin(user.id, user.email!);
  if (!ok) return NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 });
  try {
    const plans = await listPlansForBenefitEditor();
    return NextResponse.json({ success: true, plans });
  } catch (e) {
    console.error("[GET /api/admin/commission/plans]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
