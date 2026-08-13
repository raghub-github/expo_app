/**
 * GET — list Learning Centre videos.
 * POST — create a video (multipart: audience, section_title, video_title, youtube_url, duration_label?, sort_order?, file?).
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertLearningCentreVideo,
  listLearningCentreVideos,
  parseLearningCentreAudience,
  updateLearningCentreVideo,
} from "@/lib/db/operations/learning-centre";
import { uploadWithKey } from "@/lib/services/r2";

export const runtime = "nodejs";
export const maxDuration = 60;

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m?.[1] || "").toLowerCase();
}

function formStr(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function uploadThumbnail(
  file: File,
  audience: string,
  videoId: number
): Promise<{ r2Key: string; proxyUrl: string }> {
  const ext = extFromName(file.name);
  const mime = (file.type || "").toLowerCase();
  const isImage = mime.startsWith("image/") || IMAGE_EXTS.has(ext);
  if (!isImage) {
    throw new Error("Thumbnail must be an image (jpg, png, webp, gif)");
  }
  if (file.size > IMAGE_MAX_BYTES) {
    throw new Error("Thumbnail too large (max 8 MB)");
  }
  const safeExt = IMAGE_EXTS.has(ext) ? (ext === "jpeg" ? "jpg" : ext) : "jpg";
  const stamp = `${Date.now()}_${randomBytes(6).toString("hex")}`;
  const r2Key = `learning-centre/${audience}/${videoId}_${stamp}.${safeExt}`;
  await uploadWithKey(file, r2Key);
  return {
    r2Key,
    proxyUrl: `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`,
  };
}

export async function GET(request: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const audienceRaw = new URL(request.url).searchParams.get("audience") ?? "";
  const audience = audienceRaw && audienceRaw !== "all" ? parseLearningCentreAudience(audienceRaw) : null;
  if (audienceRaw && audienceRaw !== "all" && !audience) {
    return NextResponse.json(
      { error: "audience must be customer, rider, merchant, or all" },
      { status: 400 }
    );
  }

  try {
    const items = await listLearningCentreVideos(audience);
    return NextResponse.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  try {
    const form = await request.formData();
    const audience = parseLearningCentreAudience(formStr(form, "audience"));
    if (!audience) {
      return NextResponse.json({ error: "Select Rider, Merchant, or Customer" }, { status: 400 });
    }

    const sortRaw = formStr(form, "sort_order");
    const sortOrder = sortRaw ? Number(sortRaw) : null;
    const sectionRaw = formStr(form, "section_number");
    const sectionNumber = sectionRaw ? Number(sectionRaw) : null;

    let item = await insertLearningCentreVideo({
      audience,
      sectionTitle: formStr(form, "section_title"),
      videoTitle: formStr(form, "video_title"),
      youtubeUrl: formStr(form, "youtube_url"),
      durationLabel: formStr(form, "duration_label") || null,
      sectionNumber: sectionNumber != null && Number.isFinite(sectionNumber) ? sectionNumber : null,
      sortOrder: sortOrder != null && Number.isFinite(sortOrder) ? sortOrder : null,
    });

    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      const uploaded = await uploadThumbnail(file, audience, item.id);
      const updated = await updateLearningCentreVideo(item.id, {
        thumbnailR2Key: uploaded.r2Key,
        thumbnailProxyUrl: uploaded.proxyUrl,
      });
      if (updated) item = updated;
    }

    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create";
    const status = msg.includes("required") || msg.includes("valid YouTube") || msg.includes("Thumbnail")
      ? 400
      : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
