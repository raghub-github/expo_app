/**
 * POST /api/admin/user-app-categories/upload-image
 * FormData: file (required), storeType (e.g. FOOD), currentImageUrl (optional)
 *
 * R2: user-app-categories/{storeType}/{stamp}.{ext}; DB column image_url = proxy path.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";
import { uploadWithKey, deleteDocument } from "@/lib/services/r2";
import { parseUserAppCategoryStoreType } from "@/lib/user-app-categories/shared";

export const runtime = "nodejs";

async function requireSuperAdminResponse() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    if (userError && isInvalidRefreshToken(userError)) {
      await signOutIfSessionDead(supabase, userError);
      return NextResponse.json(
        { success: false, error: "Session invalid", code: "SESSION_INVALID" },
        { status: 401 }
      );
    }
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }
  const systemUser = await getSystemUserByEmail(user.email!);
  if (!systemUser) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }
  const ok = await isSuperAdmin(user.id, user.email!);
  if (!ok) {
    return NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 });
  }
  return null;
}

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  const ext = (m?.[1] || "jpg").toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? (ext === "jpeg" ? "jpg" : ext) : "jpg";
}

function extractKeyFromProxyOrUrl(value: string): string | null {
  const v = (value || "").trim();
  if (!v) return null;
  if (v.includes("/api/attachments/proxy") && v.includes("key=")) {
    try {
      const u = new URL(v, "http://dummy");
      const k = u.searchParams.get("key");
      return k ? decodeURIComponent(k) : null;
    } catch {
      return null;
    }
  }
  if (v.startsWith("http://") || v.startsWith("https://")) {
    try {
      const u = new URL(v);
      const key = u.searchParams.get("key");
      if (key) return decodeURIComponent(key);
      return u.pathname.replace(/^\/+/, "") || null;
    } catch {
      return null;
    }
  }
  return v.replace(/^\/+/, "");
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdminResponse();
  if (gate) return gate;
  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const storeTypeRaw = String(form.get("storeType") ?? "").trim();
    const storeType =
      storeTypeRaw === "" ? "FOOD" : parseUserAppCategoryStoreType(storeTypeRaw);
    if (storeType == null) {
      return NextResponse.json({ success: false, error: "Invalid storeType" }, { status: 400 });
    }
    const currentImageUrl = String(form.get("currentImageUrl") ?? "").trim();

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const ext = extFromName(file.name);
    const stamp = `${Date.now()}_${randomBytes(6).toString("hex")}`;
    const r2Key = `user-app-categories/${storeType}/${stamp}.${ext}`;

    if (currentImageUrl) {
      const oldKey = extractKeyFromProxyOrUrl(currentImageUrl);
      if (oldKey && oldKey !== r2Key) {
        deleteDocument(oldKey).catch(() => undefined);
      }
    }

    await uploadWithKey(file, r2Key);
    const url = `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;

    return NextResponse.json({ success: true, key: r2Key, url }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/user-app-categories/upload-image]", e);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}
