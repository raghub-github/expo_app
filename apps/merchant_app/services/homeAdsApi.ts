import { Image } from "react-native";
import { getConfig } from "@/config/env";
import { resolveAlertSoundUrl } from "@/lib/resolveAlertSoundUrl";
import { requestMerchantHomeAdsRefresh } from "@/lib/merchantHomeAdsBus";

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
const inflight = new Map<string, Promise<HomeAd[]>>();

function normalizeCtaAction(raw: Record<string, unknown>): HomeAdCtaAction {
  const action = String(raw.ctaAction ?? raw.cta_action ?? "")
    .trim()
    .toLowerCase();
  if (action === "bottom_sheet" || action === "bottomsheet") return "bottom_sheet";
  if (action === "redirect" || action === "open" || action === "link" || action === "navigate") {
    return "redirect";
  }
  if (action === "share") return "share";
  // Empty/unknown: prefer redirect when a target URL/path exists (never surprise-share).
  const url = String(raw.ctaUrl ?? raw.cta_url ?? "").trim();
  if (url) return "redirect";
  return "share";
}

/** Backend absolutizes proxy paths with server API_BASE_URL (often a stale LAN IP). Rewrite to this device's API host. */
function resolveHomeAdImageUrl(raw: Record<string, unknown>): string | null {
  const rawUrl =
    raw.imageUrl != null
      ? String(raw.imageUrl)
      : raw.image_url != null
        ? String(raw.image_url)
        : "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  return resolveAlertSoundUrl(trimmed);
}

function normalizeAd(raw: Record<string, unknown>): HomeAd {
  return {
    id: Number(raw.id),
    title: String(raw.title ?? ""),
    body: String(raw.body ?? ""),
    imageUrl: resolveHomeAdImageUrl(raw),
    ctaLabel: raw.ctaLabel != null ? String(raw.ctaLabel) : null,
    ctaUrl: raw.ctaUrl != null ? String(raw.ctaUrl) : raw.cta_url != null ? String(raw.cta_url) : null,
    ctaAction: normalizeCtaAction(raw),
    sheetTitle: raw.sheetTitle != null ? String(raw.sheetTitle) : null,
    sheetBody: raw.sheetBody != null ? String(raw.sheetBody) : null,
    sortOrder: Number(raw.sortOrder ?? 0) || 0,
  };
}

function prefetchImages(ads: HomeAd[]) {
  for (const ad of ads) {
    const uri = ad.imageUrl?.trim();
    if (!uri) continue;
    void Image.prefetch(uri).catch(() => {});
  }
}

function adsSignature(ads: HomeAd[]): string {
  return ads
    .map(
      (a) =>
        `${a.id}:${a.sortOrder}:${a.title}:${a.ctaAction}:${a.imageUrl ?? ""}:${a.ctaLabel ?? ""}`
    )
    .join("|");
}

/** Sync cache read for first paint (no network). */
export function peekMerchantHomeAds(placement: "home" | "orders"): HomeAd[] {
  const hit = cache.get(`merchant:${placement}`);
  return hit?.ads ?? [];
}

export function invalidateMerchantHomeAdsCache(): void {
  cache.clear();
}

async function loadMerchantHomeAds(
  placement: "home" | "orders",
  opts?: { force?: boolean; notify?: boolean }
): Promise<HomeAd[]> {
  const key = `merchant:${placement}`;
  const hit = cache.get(key);
  if (!opts?.force && hit && Date.now() - hit.at < TTL_MS) {
    prefetchImages(hit.ads);
    return hit.ads;
  }

  const inflightKey = `${key}:${opts?.force ? "force" : "ttl"}`;
  const existing = inflight.get(inflightKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const base = getConfig().apiBaseUrl.replace(/\/$/, "");
      const res = await fetch(
        `${base}/v1/home-ads/merchant?placement=${placement}&_=${Date.now()}`,
        {
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache",
          },
        }
      );
      if (!res.ok) return hit?.ads ?? [];
      const json = (await res.json()) as { ads?: Record<string, unknown>[] };
      const ads = Array.isArray(json.ads) ? json.ads.map(normalizeAd) : [];
      const prev = hit?.ads ?? [];
      const changed = adsSignature(prev) !== adsSignature(ads);
      cache.set(key, { at: Date.now(), ads });
      prefetchImages(ads);
      if (opts?.notify && changed) requestMerchantHomeAdsRefresh();
      return ads;
    } catch {
      return hit?.ads ?? [];
    } finally {
      inflight.delete(inflightKey);
    }
  })();

  inflight.set(inflightKey, promise);
  return promise;
}

export async function fetchMerchantHomeAds(
  placement: "home" | "orders",
  opts?: { force?: boolean }
): Promise<HomeAd[]> {
  return loadMerchantHomeAds(placement, { force: opts?.force === true, notify: false });
}

/** Bypass TTL for both placements after admin create / enable / disable. */
export async function refreshMerchantHomeAdsNow(): Promise<void> {
  invalidateMerchantHomeAdsCache();
  await Promise.all([
    loadMerchantHomeAds("home", { force: true, notify: false }),
    loadMerchantHomeAds("orders", { force: true, notify: false }),
  ]);
  requestMerchantHomeAdsRefresh();
}

/** Warm cache + images as soon as the partner session is up. */
export function prefetchMerchantHomeAds(): void {
  void loadMerchantHomeAds("home");
  void loadMerchantHomeAds("orders");
}
