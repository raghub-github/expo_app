/**
 * GET — list Home Ads.
 * POST — create an ad (multipart: audience, placement, title, body, cta_label?, cta_url?, sort_order?, enabled?, file?).
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertHomeAd,
  listHomeAds,
  updateHomeAd,
} from "@/lib/db/operations/home-ads";
import {
  parseHomeAdAudience,
  parseHomeAdCtaAction,
  parseHomeAdPlacement,
} from "@/lib/home-ads/shared";
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

async function uploadImage(
  file: File,
  audience: string,
  adId: number
): Promise<{ r2Key: string; proxyUrl: string }> {
  const ext = extFromName(file.name);
  const mime = (file.type || "").toLowerCase();
  const isImage = mime.startsWith("image/") || IMAGE_EXTS.has(ext);
  if (!isImage) throw new Error("Image must be jpg, png, webp, or gif");
  if (file.size > IMAGE_MAX_BYTES) throw new Error("Image too large (max 8 MB)");
  const safeExt = IMAGE_EXTS.has(ext) ? (ext === "jpeg" ? "jpg" : ext) : "jpg";
  const stamp = `${Date.now()}_${randomBytes(6).toString("hex")}`;
  const r2Key = `home-ads/${audience}/${adId}_${stamp}.${safeExt}`;
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
  const audience =
    audienceRaw && audienceRaw !== "all" ? parseHomeAdAudience(audienceRaw) : null;
  if (audienceRaw && audienceRaw !== "all" && !audience) {
    return NextResponse.json(
      { error: "audience must be customer, rider, merchant, or all" },
      { status: 400 }
    );
  }

  try {
    const items = await listHomeAds(audience);
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
    const audience = parseHomeAdAudience(formStr(form, "audience"));
    if (!audience) {
      return NextResponse.json({ error: "Select Customer, Rider, or Merchant" }, { status: 400 });
    }
    const placement = parseHomeAdPlacement(formStr(form, "placement") || "both") ?? "both";
    const ctaAction = parseHomeAdCtaAction(formStr(form, "cta_action") || "share") ?? "share";
    const sortRaw = formStr(form, "sort_order");
    const sortOrder = sortRaw ? Number(sortRaw) : 0;
    const enabled = formStr(form, "enabled") === "true" || form.get("enabled") === "on";

    let item = await insertHomeAd({
      audience,
      placement,
      title: formStr(form, "title"),
      body: formStr(form, "body"),
      ctaLabel: formStr(form, "cta_label") || null,
      ctaUrl: formStr(form, "cta_url") || null,
      ctaAction,
      sheetTitle: formStr(form, "sheet_title") || null,
      sheetBody: formStr(form, "sheet_body") || null,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      enabled,
    });

    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      const uploaded = await uploadImage(file, audience, item.id);
      item =
        (await updateHomeAd(item.id, {
          imageR2Key: uploaded.r2Key,
          imageProxyUrl: uploaded.proxyUrl,
        })) ?? item;
    }

    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
