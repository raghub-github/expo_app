import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getR2SignedUrl, extractR2KeyFromUrl } from "@/lib/r2";

/**
 * GET /api/r2/signed-url?url=... or ?key=...
 * Returns a fresh R2 signed URL for the given URL or key.
 * Used when a document image fails to load (expired URL) so the UI can refresh without full page reload.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const urlParam = req.nextUrl.searchParams.get("url");
    const keyParam = req.nextUrl.searchParams.get("key");
    const raw = urlParam || keyParam;
    if (!raw) {
      return NextResponse.json({ error: "Missing url or key" }, { status: 400 });
    }

    const key = keyParam
      ? keyParam.replace(/^\/+/, "")
      : (urlParam ? extractR2KeyFromUrl(urlParam) : null);
    if (!key) {
      return NextResponse.json({ error: "Could not resolve R2 key" }, { status: 400 });
    }

    const expiresIn = Math.min(86400 * 7, Math.max(3600, Number(req.nextUrl.searchParams.get("expires")) || 86400 * 7));
    const signedUrl = await getR2SignedUrl(key, expiresIn);
    return NextResponse.json({ signedUrl });
  } catch (e) {
    console.error("[r2/signed-url]", e);
    return NextResponse.json({ error: "Failed to generate signed URL" }, { status: 500 });
  }
}
