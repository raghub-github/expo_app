/**
 * POST — upload image for discovery CTA tiles.
 * FormData: file (required), target=deals|crazy|packaging (required)
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { uploadWithKey } from "@/lib/services/r2";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ stateId: string }> };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const TARGETS = new Set(["deals", "crazy", "packaging", "deals-hero"]);

function isAllowedTarget(target: string): boolean {
  return TARGETS.has(target) || /^[a-zA-Z0-9_-]{1,64}$/.test(target);
}

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m?.[1] || "").toLowerCase();
}

function detectImageExt(file: File): string | null {
  const ext = extFromName(file.name);
  const mime = (file.type || "").toLowerCase();
  if (!mime.startsWith("image/") && !IMAGE_EXTS.has(ext)) return null;
  if (IMAGE_EXTS.has(ext)) return ext === "jpeg" ? "jpg" : ext;
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { stateId } = await ctx.params;
  if (!stateId?.trim()) {
    return NextResponse.json({ error: "stateId required" }, { status: 400 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const targetRaw = String(form.get("target") ?? "").trim().toLowerCase();
    const target = isAllowedTarget(targetRaw) ? targetRaw : null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!target) {
      return NextResponse.json({ error: "target must be a tile id or deals-hero" }, { status: 400 });
    }

    const safeExt = detectImageExt(file);
    if (!safeExt) {
      return NextResponse.json(
        { error: "Only images (jpg, png, webp, gif) are allowed" },
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "File too large (max 8 MB)" }, { status: 400 });
    }

    const stamp = `${Date.now()}_${randomBytes(6).toString("hex")}`;
    const r2Key = `cxapp-home/discovery-cta/${stateId}/${target}/${stamp}.${safeExt}`;
    const mime =
      file.type && file.type.startsWith("image/")
        ? file.type
        : safeExt === "png"
          ? "image/png"
          : safeExt === "webp"
            ? "image/webp"
            : safeExt === "gif"
              ? "image/gif"
              : "image/jpeg";
    const typedFile =
      file.type === mime ? file : new File([await file.arrayBuffer()], file.name || `image.${safeExt}`, { type: mime });

    await uploadWithKey(typedFile, r2Key);
    const url = `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;

    return NextResponse.json({ stateId, target, url }, { status: 201 });
  } catch (e) {
    console.error("[POST discovery-cta/upload-image]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
