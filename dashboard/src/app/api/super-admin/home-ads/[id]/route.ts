import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  deleteHomeAd,
  getHomeAdById,
  setHomeAdEnabled,
  updateHomeAd,
} from "@/lib/db/operations/home-ads";
import {
  parseHomeAdAudience,
  parseHomeAdCtaAction,
  parseHomeAdPlacement,
} from "@/lib/home-ads/shared";
import { deleteDocument, uploadWithKey } from "@/lib/services/r2";

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

async function safeDeleteR2(key: string | null | undefined): Promise<void> {
  if (!key) return;
  try {
    await deleteDocument(key);
  } catch {
    /* best-effort */
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { enabled?: boolean };
      if (typeof body.enabled === "boolean") {
        const item = await setHomeAdEnabled(id, body.enabled);
        if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ item });
      }
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const existing = await getHomeAdById(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const form = await request.formData();
    const audience = parseHomeAdAudience(formStr(form, "audience")) ?? existing.audience;
    const placement =
      parseHomeAdPlacement(formStr(form, "placement") || existing.placement) ?? existing.placement;
    const ctaAction =
      parseHomeAdCtaAction(formStr(form, "cta_action") || existing.cta_action) ?? existing.cta_action;
    const sortRaw = formStr(form, "sort_order");
    const enabledRaw = formStr(form, "enabled");
    const enabled =
      enabledRaw === "true" || form.get("enabled") === "on"
        ? true
        : enabledRaw === "false"
          ? false
          : existing.enabled;

    let imageR2Key: string | null | undefined = undefined;
    let imageProxyUrl: string | null | undefined = undefined;
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      const ext = extFromName(file.name);
      const mime = (file.type || "").toLowerCase();
      if (!(mime.startsWith("image/") || IMAGE_EXTS.has(ext))) {
        return NextResponse.json({ error: "Image must be jpg, png, webp, or gif" }, { status: 400 });
      }
      if (file.size > IMAGE_MAX_BYTES) {
        return NextResponse.json({ error: "Image too large (max 8 MB)" }, { status: 400 });
      }
      const safeExt = IMAGE_EXTS.has(ext) ? (ext === "jpeg" ? "jpg" : ext) : "jpg";
      const stamp = `${Date.now()}_${randomBytes(6).toString("hex")}`;
      const r2Key = `home-ads/${audience}/${id}_${stamp}.${safeExt}`;
      await uploadWithKey(file, r2Key);
      await safeDeleteR2(existing.image_r2_key);
      imageR2Key = r2Key;
      imageProxyUrl = `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
    }

    const item = await updateHomeAd(id, {
      audience,
      placement,
      title: formStr(form, "title") || existing.title,
      body: formStr(form, "body") || existing.body,
      ctaLabel: form.has("cta_label") ? formStr(form, "cta_label") || null : existing.cta_label,
      ctaUrl: form.has("cta_url") ? formStr(form, "cta_url") || null : existing.cta_url,
      ctaAction,
      sheetTitle: form.has("sheet_title") ? formStr(form, "sheet_title") || null : existing.sheet_title,
      sheetBody: form.has("sheet_body") ? formStr(form, "sheet_body") || null : existing.sheet_body,
      sortOrder: sortRaw ? Number(sortRaw) : existing.sort_order,
      enabled,
      imageR2Key,
      imageProxyUrl,
    });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const deleted = await deleteHomeAd(id);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await safeDeleteR2(deleted.image_r2_key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
