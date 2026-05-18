/**
 * GET/PATCH /api/admin/commission/default — platform-wide default commission %.
 * Super-admin only. PATCH writes to commission_audit_log.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getGlobalDefaultPercent, setGlobalDefaultPercent } from "@/lib/db/operations/commission";

export const runtime = "nodejs";

async function gate(): Promise<{ ok: true; actorId: number | null } | { ok: false; res: NextResponse }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, res: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }
  const ok = await isSuperAdmin(user.id, user.email!);
  if (!ok) {
    return { ok: false, res: NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 }) };
  }
  const sys = await getSystemUserByEmail(user.email!);
  return { ok: true, actorId: sys?.id ?? null };
}

export async function GET() {
  const g = await gate();
  if (!g.ok) return g.res;
  try {
    const percent = await getGlobalDefaultPercent();
    return NextResponse.json({ success: true, percent });
  } catch (e) {
    console.error("[GET /api/admin/commission/default]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const g = await gate();
  if (!g.ok) return g.res;
  try {
    const body = (await req.json()) as { percent?: unknown; reason?: unknown };
    const percent = Number(body.percent);
    if (!Number.isFinite(percent) || percent < 0 || percent >= 100) {
      return NextResponse.json({ success: false, error: "percent must be a number in [0, 100)" }, { status: 400 });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;
    const result = await setGlobalDefaultPercent(percent, g.actorId, reason);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[PATCH /api/admin/commission/default]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
