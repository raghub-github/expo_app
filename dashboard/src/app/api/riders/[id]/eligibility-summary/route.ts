/**
 * GET /api/riders/[id]/eligibility-summary (§41) — the rider's REAL onboarding + service
 * eligibility summary for the agent/super-admin onboarding view. Proxies to the backend
 * (which is authoritative); the dashboard never computes eligibility itself.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

function backendBase(): string {
  const raw =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    if (isInvalidRefreshToken(userError)) {
      await signOutIfSessionDead(supabase, userError);
      return NextResponse.json({ error: "Session invalid", code: "SESSION_INVALID" }, { status: 401 });
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userIsSuperAdmin = await isSuperAdmin(user.id, user.email!);
  const hasRiderAccess = await hasDashboardAccessByAuth(user.id, user.email!, "RIDER");
  if (!userIsSuperAdmin && !hasRiderAccess) {
    return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
  }

  const { id } = await params;
  const riderId = parseInt(id, 10);
  if (Number.isNaN(riderId)) return NextResponse.json({ error: "invalid rider id" }, { status: 400 });

  const base = backendBase();
  if (!base) return NextResponse.json({ error: "backend_not_configured" }, { status: 503 });

  const secret = process.env.INTERNAL_API_TOKEN;
  try {
    const upstream = await fetch(`${base}/v1/rider-eligibility/rider-summary`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Internal-Secret": secret } : {}),
        "X-Actor-Role": userIsSuperAdmin ? "super_admin" : "rider_admin",
      },
      body: JSON.stringify({ riderId }),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[GET riders/[id]/eligibility-summary proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
