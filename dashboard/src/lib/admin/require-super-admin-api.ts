import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByAuthId, getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";
import { isSuperAdmin } from "@/lib/permissions/engine";

export async function requireSuperAdminApi() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    if (userError && isInvalidRefreshToken(userError)) {
      await supabase.auth.signOut();
      return {
        ok: false as const,
        response: NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        ),
      };
    }
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }),
    };
  }

  const systemUser =
    (user.id ? await getSystemUserByAuthId(user.id) : null) ??
    (user.email ? await getSystemUserByEmail(user.email) : null);

  if (!systemUser) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: "User not found" }, { status: 404 }),
    };
  }

  const ok = await isSuperAdmin(user.id, user.email ?? systemUser.email);
  if (!ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 }),
    };
  }

  return { ok: true as const, systemUserId: systemUser.id };
}
