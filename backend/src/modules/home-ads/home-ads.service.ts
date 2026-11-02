import { getSql } from "../../db/client.js";
import { getR2SignedUrl } from "../../services/r2/r2Service.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";

export const HOME_AD_AUDIENCES = ["customer", "rider", "merchant"] as const;
export type HomeAdAudience = (typeof HOME_AD_AUDIENCES)[number];
export type HomeAdPlacement = "home" | "orders" | "both";
export type HomeAdCtaAction = "bottom_sheet" | "share" | "redirect";

export type HomeAdClient = {
  id: number;
  title: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  ctaAction: HomeAdCtaAction;
  sheetTitle: string | null;
  sheetBody: string | null;
  sortOrder: number;
};

const SIGNED_TTL_SEC = 60 * 60 * 24 * 6;

export function parseHomeAdAudience(value: string): HomeAdAudience | null {
  const v = String(value ?? "").trim().toLowerCase();
  return HOME_AD_AUDIENCES.includes(v as HomeAdAudience) ? (v as HomeAdAudience) : null;
}

function parseCtaAction(value: unknown): HomeAdCtaAction {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "bottom_sheet") return "bottom_sheet";
  if (v === "redirect") return "redirect";
  return "share";
}

export async function listEnabledHomeAdsForClient(
  audience: HomeAdAudience,
  placement: "home" | "orders"
): Promise<HomeAdClient[]> {
  const sql = getSql();
  let rows: Record<string, unknown>[] = [];
  try {
    rows = (await sql`
      SELECT
        id, title, body, image_r2_key, image_proxy_url,
        cta_label, cta_url, cta_action, sheet_title, sheet_body, sort_order
      FROM home_ads
      WHERE audience = ${audience}
        AND enabled = true
        AND (placement = ${placement} OR placement = 'both')
      ORDER BY sort_order ASC, id ASC
      LIMIT 20
    `) as Record<string, unknown>[];
  } catch {
    // Table / columns may not exist until migration — apps treat as empty.
    return [];
  }

  const out: HomeAdClient[] = [];
  for (const r of rows) {
    const proxy = r.image_proxy_url != null ? String(r.image_proxy_url).trim() : "";
    const key = r.image_r2_key != null ? String(r.image_r2_key).trim() : "";
    let imageUrl: string | null = null;

    if (proxy) {
      imageUrl = toAbsoluteClientMediaUrl(proxy);
    }
    if (!imageUrl && key) {
      try {
        imageUrl = await getR2SignedUrl(key, SIGNED_TTL_SEC);
      } catch {
        imageUrl = toAbsoluteClientMediaUrl(`/v1/attachments/proxy?key=${encodeURIComponent(key)}`);
      }
    }

    out.push({
      id: Number(r.id),
      title: String(r.title ?? ""),
      body: String(r.body ?? ""),
      imageUrl,
      ctaLabel: r.cta_label != null ? String(r.cta_label) : null,
      ctaUrl: r.cta_url != null ? String(r.cta_url) : null,
      ctaAction: parseCtaAction(r.cta_action),
      sheetTitle: r.sheet_title != null ? String(r.sheet_title) : null,
      sheetBody: r.sheet_body != null ? String(r.sheet_body) : null,
      sortOrder: Number(r.sort_order ?? 0) || 0,
    });
  }
  return out;
}
