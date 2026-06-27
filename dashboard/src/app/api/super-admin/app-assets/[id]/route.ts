/**
 * POST — upload / replace image for an app static asset slot.
 * FormData: file (required)
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  clearAppStaticAssetImage,
  getAppStaticAssetById,
  setAppStaticAssetImage,
} from "@/lib/db/operations/app-static-assets";
import { uploadWithKey, deleteDocument } from "@/lib/services/r2";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m?.[1] || "").toLowerCase();
}

function extractKeyFromProxyOrUrl(value: string): string | null {
  const v = (value || "").trim();
  if (!v) return null;
  if (v.includes("/attachments/proxy") && v.includes("key=")) {
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

export async function POST(request: NextRequest, ctx: RouteCtx) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const existing = await getAppStaticAssetById(id);
    if (!existing) {
      return NextResponse.json({ error: "Asset slot not found" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = extFromName(file.name);
    const mime = (file.type || "").toLowerCase();
    if (!mime.startsWith("image/") && !IMAGE_EXTS.has(ext)) {
      return NextResponse.json(
        { error: "Only images (jpg, png, webp, gif) are allowed" },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 8 MB)" }, { status: 400 });
    }

    const safeExt = IMAGE_EXTS.has(ext) ? (ext === "jpeg" ? "jpg" : ext) : "jpg";
    const stamp = `${Date.now()}_${randomBytes(6).toString("hex")}`;
    const r2Key = `app-static-assets/${existing.app}/${existing.id.replace(/\./g, "_")}/${stamp}.${safeExt}`;

    await uploadWithKey(file, r2Key);
    const proxyUrl = `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;

    const oldKey = existing.proxy_url ? extractKeyFromProxyOrUrl(existing.proxy_url) : null;
    const updated = await setAppStaticAssetImage(id, r2Key, proxyUrl);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
    }

    if (oldKey && oldKey !== r2Key) {
      deleteDocument(oldKey).catch(() => undefined);
    }

    return NextResponse.json({ item: updated }, { status: 201 });
  } catch (e) {
    console.error("[POST app-assets/upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteCtx) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const existing = await getAppStaticAssetById(id);
    if (!existing) {
      return NextResponse.json({ error: "Asset slot not found" }, { status: 404 });
    }

    const oldKey = existing.proxy_url ? extractKeyFromProxyOrUrl(existing.proxy_url) : null;
    const updated = await clearAppStaticAssetImage(id);
    if (!updated) {
      return NextResponse.json({ error: "Failed to clear asset" }, { status: 500 });
    }

    if (oldKey) {
      deleteDocument(oldKey).catch(() => undefined);
    }

    return NextResponse.json({ item: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
