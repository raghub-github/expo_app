import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { forwardJson, notConfigured } from "@/lib/store-ranking-proxy";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;
  const nc = notConfigured();
  if (nc) return nc;
  const profile = req.nextUrl.searchParams.get("profile") || "HOME_FOOD";
  return forwardJson(`/v1/admin/store-ranking/config?profile=${encodeURIComponent(profile)}`, {
    method: "GET",
  });
}

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;
  const nc = notConfigured();
  if (nc) return nc;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 });
  }
  let actorEmail: string | undefined;
  try {
    const auth = await getAuthenticatedApiUser(req);
    if (auth.ok && auth.user?.email) actorEmail = auth.user.email;
  } catch {
    /* ignore */
  }
  return forwardJson("/v1/admin/store-ranking/config", { method: "PUT", body, actorEmail });
}
