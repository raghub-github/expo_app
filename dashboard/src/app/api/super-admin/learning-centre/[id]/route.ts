/**
 * PATCH — update a Learning Centre video (multipart, same fields as create; file optional).
 * DELETE — remove the video and its thumbnail from R2.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  deleteLearningCentreVideo,
  getLearningCentreVideoById,
  parseLearningCentreAudience,
  updateLearningCentreVideo,
} from "@/lib/db/operations/learning-centre";
import { deleteDocument, uploadWithKey } from "@/lib/services/r2";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ id: string }> };

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m?.[1] || "").toLowerCase();
}

function formStr(form: FormData, key: string): string | undefined {
  if (!form.has(key)) return undefined;
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function safeDeleteR2(key: string | null | undefined) {
  const k = key?.trim();
  if (!k) return;
  try {
    await deleteDocument(k);
  } catch {
    /* ignore missing object */
  }
}

export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const existing = await getLearningCentreVideoById(id);
    if (!existing) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const form = await request.formData();
    const audienceRaw = formStr(form, "audience");
    const audience = audienceRaw ? parseLearningCentreAudience(audienceRaw) : undefined;
    if (audienceRaw && !audience) {
      return NextResponse.json({ error: "Select Rider, Merchant, or Customer" }, { status: 400 });
    }

    const sortRaw = formStr(form, "sort_order");
    const sortOrder = sortRaw ? Number(sortRaw) : undefined;
    const sectionRaw = formStr(form, "section_number");
    const sectionNumber = sectionRaw ? Number(sectionRaw) : undefined;

    const file = form.get("file");
    let thumbnailR2Key: string | undefined;
    let thumbnailProxyUrl: string | undefined;
    if (file instanceof File && file.size > 0) {
      const ext = extFromName(file.name);
      const mime = (file.type || "").toLowerCase();
      const isImage = mime.startsWith("image/") || IMAGE_EXTS.has(ext);
      if (!isImage) {
        return NextResponse.json(
          { error: "Thumbnail must be an image (jpg, png, webp, gif)" },
          { status: 400 }
        );
      }
      if (file.size > IMAGE_MAX_BYTES) {
        return NextResponse.json({ error: "Thumbnail too large (max 8 MB)" }, { status: 400 });
      }
      const safeExt = IMAGE_EXTS.has(ext) ? (ext === "jpeg" ? "jpg" : ext) : "jpg";
      const stamp = `${Date.now()}_${randomBytes(6).toString("hex")}`;
      const nextAudience = audience ?? existing.audience;
      const r2Key = `learning-centre/${nextAudience}/${id}_${stamp}.${safeExt}`;
      await uploadWithKey(file, r2Key);
      await safeDeleteR2(existing.thumbnail_r2_key);
      thumbnailR2Key = r2Key;
      thumbnailProxyUrl = `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
    }

    const item = await updateLearningCentreVideo(id, {
      audience: audience ?? undefined,
      sectionTitle: formStr(form, "section_title"),
      videoTitle: formStr(form, "video_title"),
      youtubeUrl: formStr(form, "youtube_url"),
      durationLabel: formStr(form, "duration_label"),
      sectionNumber: sectionNumber != null && Number.isFinite(sectionNumber) ? sectionNumber : undefined,
      sortOrder: sortOrder != null && Number.isFinite(sortOrder) ? sortOrder : undefined,
      thumbnailR2Key,
      thumbnailProxyUrl,
    });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update";
    const status = msg.includes("required") || msg.includes("valid YouTube") || msg.includes("Thumbnail")
      ? 400
      : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteCtx) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const deleted = await deleteLearningCentreVideo(id);
    if (!deleted) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    await safeDeleteR2(deleted.thumbnail_r2_key);
    return NextResponse.json({ item: deleted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
