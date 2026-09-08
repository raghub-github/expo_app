/**
 * Revoke an admin ELIGIBILITY_OVERRIDE (§31). Super-admin only. Proxies to the backend.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { fetchBackendInternal } from "@/lib/backend-internal";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await isSuperAdmin(user.id, user.email!))) {
    return NextResponse.json({ error: "Only a super admin can revoke an override." }, { status: 403 });
  }

  const riderId = parseInt((await params).id, 10);
  if (Number.isNaN(riderId)) return NextResponse.json({ error: "invalid rider id" }, { status: 400 });

  let body: { id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: "override id required" }, { status: 400 });

  try {
    const { response, data } = await fetchBackendInternal("/v1/rider-eligibility/rider-overrides/revoke", {
      method: "POST",
      actorRole: "super_admin",
      body: JSON.stringify({ id: body.id, riderId }),
    });
    return NextResponse.json(data, { status: response.status });
  } catch (e) {
    console.error("[POST eligibility-overrides/revoke]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
