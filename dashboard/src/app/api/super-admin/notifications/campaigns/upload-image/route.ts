/**
 * POST /api/super-admin/notifications/campaigns/upload-image
 * FormData: file (required), currentImageUrl (optional)
 * Returns absolute HTTPS URL suitable for FCM rich notifications.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { uploadWithKey, deleteDocument } from "@/lib/services/r2";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extFromName(name: string, mime: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  if (m?.[1]) {
    const ext = m[1].toLowerCase();
    if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
      return ext === "jpeg" ? "jpg" : ext;
    }
  }
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
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
  return null;
}

function publicOrigin(req: NextRequest): string {
  const fromEnv =
    process.env.DASHBOARD_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  if (host) return `${proto}://${host}`.replace(/\/$/, "");
  return "https://control.gatimitra.com";
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const currentImageUrl = String(form.get("currentImageUrl") ?? "").trim();

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { success: false, error: "Only JPEG, PNG, WebP, or GIF images are allowed" },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "Image must be 5 MB or smaller" },
        { status: 400 },
      );
    }

    const ext = extFromName(file.name, file.type);
    const stamp = `${Date.now()}_${randomBytes(6).toString("hex")}`;
    const r2Key = `notifications/campaigns/${stamp}.${ext}`;

    if (currentImageUrl) {
      const oldKey = extractKeyFromProxyOrUrl(currentImageUrl);
      if (oldKey && oldKey !== r2Key) {
        deleteDocument(oldKey).catch(() => undefined);
      }
    }

    await uploadWithKey(file, r2Key);
    const proxyPath = `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
    const url = `${publicOrigin(request)}${proxyPath}`;

    return NextResponse.json({ success: true, key: r2Key, url, proxyPath }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/super-admin/notifications/campaigns/upload-image]", e);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}
