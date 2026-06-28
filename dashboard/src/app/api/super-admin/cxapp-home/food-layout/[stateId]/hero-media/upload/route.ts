/**
 * POST — upload image or MP4 for grid-first hero carousel.
 * FormData: file (required)
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getStateGridFirstHeroMedia,
  saveStateGridFirstHeroMedia,
} from "@/lib/db/operations/cxapp-food-home-layout";
import { uploadWithKey } from "@/lib/services/r2";
import {
  MAX_GRID_FIRST_HERO_MEDIA,
  type GridFirstHeroMediaItem,
  type GridFirstHeroMediaKind,
} from "@/lib/cxapp-home/grid-first-hero-media";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ stateId: string }> };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const VIDEO_EXTS = new Set(["mp4"]);

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m?.[1] || "").toLowerCase();
}

function detectKind(file: File): GridFirstHeroMediaKind | null {
  const ext = extFromName(file.name);
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("video/") || VIDEO_EXTS.has(ext)) return "video";
  if (mime.startsWith("image/") || IMAGE_EXTS.has(ext)) return "image";
  return null;
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
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const kind = detectKind(file);
    if (!kind) {
      return NextResponse.json(
        { error: "Only images (jpg, png, webp, gif) or MP4 video are allowed" },
        { status: 400 }
      );
    }

    const maxBytes = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File too large (max ${kind === "video" ? "25" : "8"} MB)` },
        { status: 400 }
      );
    }

    const existing = await getStateGridFirstHeroMedia(stateId);
    if (existing.length >= MAX_GRID_FIRST_HERO_MEDIA) {
      return NextResponse.json(
        { error: `Maximum ${MAX_GRID_FIRST_HERO_MEDIA} hero slides allowed` },
        { status: 400 }
      );
    }

    const ext = extFromName(file.name);
    const safeExt =
      kind === "video"
        ? VIDEO_EXTS.has(ext)
          ? ext
          : "mp4"
        : IMAGE_EXTS.has(ext)
          ? ext === "jpeg"
            ? "jpg"
            : ext
          : "jpg";

    const stamp = `${Date.now()}_${randomBytes(6).toString("hex")}`;
    const r2Key = `cxapp-home/grid-first-hero/${stateId}/${stamp}.${safeExt}`;

    await uploadWithKey(file, r2Key);
    const url = `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;

    const item: GridFirstHeroMediaItem = {
      id: randomUUID(),
      kind,
      url,
      sortOrder: existing.length,
    };

    const items = await saveStateGridFirstHeroMedia(stateId, [...existing, item]);
    return NextResponse.json({ stateId, item, items }, { status: 201 });
  } catch (e) {
    console.error("[POST hero-media/upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
