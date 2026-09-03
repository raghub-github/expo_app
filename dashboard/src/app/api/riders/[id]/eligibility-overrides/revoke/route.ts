/**
 * Revoke an admin ELIGIBILITY_OVERRIDE (§31). Super-admin only. Proxies to the backend.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

function backendBase(): string {
  const raw =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

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

  const base = backendBase();
  if (!base) return NextResponse.json({ error: "backend_not_configured" }, { status: 503 });
  const secret = process.env.INTERNAL_API_TOKEN;
  try {
    const upstream = await fetch(`${base}/v1/rider-eligibility/rider-overrides/revoke`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Internal-Secret": secret } : {}),
        "X-Actor-Role": "super_admin",
      },
      body: JSON.stringify({ id: body.id, riderId }),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[POST eligibility-overrides/revoke]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
