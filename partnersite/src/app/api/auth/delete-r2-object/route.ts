import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { getParentRoot } from "@/lib/r2-paths";
import { extractR2KeyFromUrl, deleteFromR2, normalizeR2ObjectKey } from "@/lib/r2";

/**
 * POST /api/auth/delete-r2-object
 * Deletes a single R2 object by URL or key. Used when merchant replaces an attachment
 * during registration (discard current + upload new). Only keys under the caller’s
 * merchant parent folder are allowed — never arbitrary bucket paths.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json({ error: "Merchant access required" }, { status: 403 });
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

    const normalized = normalizeR2ObjectKey(key);
    const parentRoot = getParentRoot(validation.merchantParentId);
    // Accept both `docs/merchants/{id}/...` and legacy `merchants/{id}/...` (proxy historically stripped docs/).
    const allowedPrefixes = [
      `${parentRoot}/`,
      parentRoot.startsWith("docs/")
        ? `${parentRoot.replace(/^docs\//, "")}/`
        : `docs/${parentRoot}/`,
    ].filter((p, i, arr) => p && arr.indexOf(p) === i);

    if (!allowedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
      return NextResponse.json(
        { error: "You can only delete files under your merchant storage folder" },
        { status: 403 }
      );
    }

    // Prefer the key shape that matches how objects were uploaded (docs/ prefix when present on disk).
    const deleteKey = normalized.startsWith("docs/")
      ? normalized
      : normalized.startsWith("merchants/")
        ? `docs/${normalized}`
        : normalized;
    try {
      await deleteFromR2(deleteKey);
    } catch (primaryErr) {
      if (deleteKey !== normalized) {
        await deleteFromR2(normalized);
      } else {
        throw primaryErr;
      }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.warn("[delete-r2-object]", err);
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
