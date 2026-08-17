import type { MerchantSummary } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

/** Parent brand logos / default store art — not valid restaurant hero photos. */
export function isMerchantBrandOrPlaceholderImageUrl(
  url: string | null | undefined
): boolean {
  const u = url?.trim().toLowerCase() ?? "";
  if (!u) return false;
  return (
    u.includes("partner-control") ||
    u.includes("partner_control") ||
    u.includes("mxappicon") ||
    u.includes("store_logo") ||
    u.includes("store-logo") ||
    u.includes("parent_logo") ||
    u.includes("merchant_logo") ||
    u.includes("/logo.") ||
    u.includes("default-banner") ||
    u.includes("default_banner") ||
    u.includes("placeholder")
  );
}

function normalizeUri(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return toAbsoluteImageUrl(trimmed) ?? trimmed;
}

/** Food / gallery photo suitable for list-card hero carousel. */
export function isFoodHeroImageUrl(url: string | null | undefined): boolean {
  const abs = normalizeUri(url);
  return Boolean(abs && !isMerchantBrandOrPlaceholderImageUrl(abs));
}

export function resolveMerchantFoodHeroUris(merchant: MerchantSummary): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: unknown) => {
    const abs = normalizeUri(raw);
    if (!abs || seen.has(abs) || !isFoodHeroImageUrl(abs)) return;
    seen.add(abs);
    out.push(abs);
  };

  add(merchant.banner_url);
  add(merchant.displayImage);
  for (const g of merchant.galleryImages ?? []) add(g);

  return out;
}

export function resolveMerchantFoodHeroPrimaryUri(
  merchant: MerchantSummary
): string | null {
  return resolveMerchantFoodHeroUris(merchant)[0] ?? null;
}
