/**
 * Admin ELIGIBILITY_OVERRIDE management (§31) for a rider — list + create. Proxies to the
 * backend (authoritative); records the acting admin's email as the audit label.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";
import { fetchBackendInternal } from "@/lib/backend-internal";

export const runtime = "nodejs";

async function gate() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    if (isInvalidRefreshToken(error)) await signOutIfSessionDead(supabase, error);
    return { ok: false as const, res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const sa = await isSuperAdmin(user.id, user.email!);
  const rider = await hasDashboardAccessByAuth(user.id, user.email!, "RIDER");
  if (!sa && !rider) {
    return { ok: false as const, res: NextResponse.json({ error: "Insufficient permissions." }, { status: 403 }) };
  }
  return { ok: true as const, email: user.email!, isSuperAdmin: sa };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if (!g.ok) return g.res;
  const riderId = parseInt((await params).id, 10);
  if (Number.isNaN(riderId)) return NextResponse.json({ error: "invalid rider id" }, { status: 400 });
  try {
    const { response, data } = await fetchBackendInternal(
      `/v1/rider-eligibility/rider-overrides?riderId=${riderId}`,
      {
        method: "GET",
        actorRole: g.isSuperAdmin ? "super_admin" : "rider_admin",
      }
    );
    return NextResponse.json(data, { status: response.status });
  } catch (e) {
    console.error("[GET eligibility-overrides]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if (!g.ok) return g.res;
  if (!g.isSuperAdmin) {
    return NextResponse.json({ error: "Only a super admin can grant an override." }, { status: 403 });
  }
  const riderId = parseInt((await params).id, 10);
  if (Number.isNaN(riderId)) return NextResponse.json({ error: "invalid rider id" }, { status: 400 });

  let body: { service?: string; reason?: string; effectiveTo?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const { response, data } = await fetchBackendInternal("/v1/rider-eligibility/rider-overrides", {
      method: "POST",
      actorRole: "super_admin",
      body: JSON.stringify({
        riderId,
        service: body.service,
        reason: body.reason,
        createdByLabel: g.email,
        effectiveTo: body.effectiveTo ?? null,
      }),
    });
    return NextResponse.json(data, { status: response.status });
  } catch (e) {
    console.error("[POST eligibility-overrides]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
