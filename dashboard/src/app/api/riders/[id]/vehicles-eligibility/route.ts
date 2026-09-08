/**
 * GET /api/riders/[id]/vehicles-eligibility (§46) — a rider's vehicles with per-vehicle
 * service eligibility + a compact DL/RC verification attempt history, for the agent view.
 * Proxies to the backend (authoritative).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";
import { fetchBackendInternal } from "@/lib/backend-internal";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (isInvalidRefreshToken(error)) await signOutIfSessionDead(supabase, error);
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const sa = await isSuperAdmin(user.id, user.email!);
  const rider = await hasDashboardAccessByAuth(user.id, user.email!, "RIDER");
  if (!sa && !rider) return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });

  const riderId = parseInt((await params).id, 10);
  if (Number.isNaN(riderId)) return NextResponse.json({ error: "invalid rider id" }, { status: 400 });

  try {
    const { response, data } = await fetchBackendInternal("/v1/rider-eligibility/rider-vehicles", {
      method: "POST",
      actorRole: sa ? "super_admin" : "rider_admin",
      body: JSON.stringify({ riderId }),
    });
    return NextResponse.json(data, { status: response.status });
  } catch (e) {
    console.error("[GET riders/[id]/vehicles-eligibility]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
