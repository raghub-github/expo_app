/**
 * GET /api/riders/[id]/vehicles-eligibility (§46) — a rider's vehicles with per-vehicle
 * service eligibility + a compact DL/RC verification attempt history, for the agent view.
 * Proxies to the backend (authoritative).
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

  const base = backendBase();
  if (!base) return NextResponse.json({ error: "backend_not_configured" }, { status: 503 });
  const secret = process.env.INTERNAL_API_TOKEN;
  try {
    const upstream = await fetch(`${base}/v1/rider-eligibility/rider-vehicles`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Internal-Secret": secret } : {}),
        "X-Actor-Role": sa ? "super_admin" : "rider_admin",
      },
      body: JSON.stringify({ riderId }),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[GET riders/[id]/vehicles-eligibility]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
