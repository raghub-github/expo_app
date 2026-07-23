import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { backendFetch } from "@/lib/notif-backend";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Registers a Super Admin dashboard browser FCM token on the backend so
 * admin-targeted campaigns can reach the control panel when opted in.
 */
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    platform?: string;
  };
  const token = String(body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "token_required" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id || user?.email || "super_admin";

  const { status, body: resBody } = await backendFetch("/v1/notifications/browser-tokens", {
    method: "POST",
    body: JSON.stringify({
      token,
      platform: body.platform ?? "web",
      user_id: userId,
      role: "admin",
      source: "dashboard",
    }),
  });
  return NextResponse.json(resBody, { status });
}
