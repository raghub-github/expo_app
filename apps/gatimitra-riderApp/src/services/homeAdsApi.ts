import { getConfig } from "@/config/env";

export type HomeAdCtaAction = "bottom_sheet" | "share" | "redirect";

export type HomeAd = {
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

const cache = new Map<string, { at: number; ads: HomeAd[] }>();
const TTL_MS = 45_000;

function normalizeAd(raw: Record<string, unknown>): HomeAd {
  const action = String(raw.ctaAction ?? raw.cta_action ?? "")
    .trim()
    .toLowerCase();
  const ctaUrl =
    raw.ctaUrl != null ? String(raw.ctaUrl) : raw.cta_url != null ? String(raw.cta_url) : null;
  let ctaAction: HomeAdCtaAction = "share";
  if (action === "bottom_sheet" || action === "bottomsheet") ctaAction = "bottom_sheet";
  else if (action === "redirect" || action === "open" || action === "link" || action === "navigate") {
    ctaAction = "redirect";
  } else if (action === "share") ctaAction = "share";
  else if (ctaUrl?.trim()) ctaAction = "redirect";
  return {
    id: Number(raw.id),
    title: String(raw.title ?? ""),
    body: String(raw.body ?? ""),
    imageUrl: raw.imageUrl != null ? String(raw.imageUrl) : null,
    ctaLabel: raw.ctaLabel != null ? String(raw.ctaLabel) : null,
    ctaUrl,
    ctaAction,
    sheetTitle: raw.sheetTitle != null ? String(raw.sheetTitle) : null,
    sheetBody: raw.sheetBody != null ? String(raw.sheetBody) : null,
    sortOrder: Number(raw.sortOrder ?? 0) || 0,
  };
}

export async function fetchRiderHomeAds(
  placement: "home" | "orders"
): Promise<HomeAd[]> {
  const key = `rider:${placement}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ads;

  const base = getConfig().apiBaseUrl.replace(/\/$/, "");
  const res = await fetch(
    `${base}/v1/home-ads/rider?placement=${placement}&_=${Date.now()}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return hit?.ads ?? [];
  const json = (await res.json()) as { ads?: Record<string, unknown>[] };
  const ads = Array.isArray(json.ads) ? json.ads.map(normalizeAd) : [];
  cache.set(key, { at: Date.now(), ads });
  return ads;
}
