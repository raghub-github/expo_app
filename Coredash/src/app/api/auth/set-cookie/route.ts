import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSql, safeQuery } from "@/lib/db/client";
import { systemUserIsSuperAdmin } from "@/lib/auth/session";
import { COREDASH_ACCESS_COOKIE, NOT_AUTHORIZED, accessCookieOptions } from "@/lib/auth/access";
import { expireCoredashCookies } from "@/lib/auth/clear";
import { logAuthEvent } from "@/lib/auth/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deny(request: NextRequest, status: number, error: string) {
  const res = NextResponse.json({ success: false, error }, { status });
  res.headers.set("Cache-Control", "no-store, private");
  expireCoredashCookies(
    res,
    request.cookies.getAll().map((c) => c.name)
  );
  return res;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { access_token?: string; refresh_token?: string };
    const access = body.access_token?.trim() ?? "";
    const refresh = body.refresh_token?.trim() ?? "";
    if (!access || !refresh) {
      return deny(request, 400, "Missing tokens");
    }

    const supabase = await createServerSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(access);
    const user = userData.user;
    if (userError || !user?.id || !user.email) {
      logAuthEvent("LOGIN_REJECT", { reason: "getUser_invalid" });
      return deny(request, 401, userError?.message || "Invalid session");
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: access,
      refresh_token: refresh,
    });
    if (sessionError || !sessionData.session?.user?.id || sessionData.session.user.id !== user.id) {
      logAuthEvent("LOGIN_REJECT", { userId: user.id, reason: "setSession_mismatch" });
      await supabase.auth.signOut().catch(() => undefined);
      return deny(request, 401, sessionError?.message || "Invalid session");
    }

    const email = user.email.trim().toLowerCase();
    const sql = getSql();
    const rows = await safeQuery(
      "login-user",
      () =>
        sql<{ id: number; status: string; primary_role: string }[]>`
          SELECT id, status::text AS status, primary_role::text AS primary_role
          FROM system_users
          WHERE lower(trim(email)) = ${email} AND deleted_at IS NULL
          LIMIT 1
        `,
      []
    );
    const row = rows[0];
    if (!row || String(row.status).toUpperCase() !== "ACTIVE") {
      await supabase.auth.signOut().catch(() => undefined);
      return deny(request, 403, NOT_AUTHORIZED);
    }

    if (!(await systemUserIsSuperAdmin(Number(row.id), row.primary_role))) {
      await supabase.auth.signOut().catch(() => undefined);
      return deny(request, 403, NOT_AUTHORIZED);
    }

    const res = NextResponse.json({
      success: true,
      userId: user.id,
      email,
    });
    res.headers.set("Cache-Control", "no-store, private");
    res.cookies.set(COREDASH_ACCESS_COOKIE, user.id, accessCookieOptions());
    logAuthEvent("LOGIN", { userId: user.id, email, reason: "session_established" });
    return res;
  } catch (error) {
    const res = NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "SET_COOKIE_ERROR" },
      { status: 500 }
    );
    res.headers.set("Cache-Control", "no-store, private");
    expireCoredashCookies(
      res,
      request.cookies.getAll().map((c) => c.name)
    );
    return res;
  }
}
