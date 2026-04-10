import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";

export async function requireSuperAdminApi(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  let {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user?.id) {
    const h = await headers();
    const authHeader = h.get("authorization") ?? h.get("Authorization");
    const m = authHeader?.match(/^Bearer\s+(.+)$/i);
    if (m?.[1]) {
      const jwtResult = await supabase.auth.getUser(m[1]);
      user = jwtResult.data.user;
      error = jwtResult.error;
    }
  }

  if (error || !user?.id || !user.email) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await isSuperAdmin(user.id, user.email))) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true };
}
