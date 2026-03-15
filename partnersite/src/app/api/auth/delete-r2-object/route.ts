import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { extractR2KeyFromUrl, deleteFromR2 } from "@/lib/r2";

/**
 * POST /api/auth/delete-r2-object
 * Deletes an R2 object by URL or key. Used when merchant replaces an attachment
 * (discard current + upload new) so the previous file is removed from R2.
 * Requires authenticated user.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const urlOrKey = typeof body?.urlOrKey === "string" ? body.urlOrKey.trim() : null;
    if (!urlOrKey) {
      return NextResponse.json({ error: "urlOrKey is required" }, { status: 400 });
    }

    const key = extractR2KeyFromUrl(urlOrKey) || (urlOrKey.includes("://") ? null : urlOrKey.replace(/^\/+/, ""));
    if (!key) {
      return NextResponse.json({ error: "Could not resolve R2 key" }, { status: 400 });
    }

    await deleteFromR2(key);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.warn("[delete-r2-object]", err);
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
