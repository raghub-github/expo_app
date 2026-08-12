/**
 * CMS-managed merchant app images (super-admin → app_static_assets).
 * Same contract as partnersite `merchantAppAssets`.
 */

export type MerchantAppAssetItem = {
  id: string;
  section: string;
  label: string;
  description: string;
  proxyUrl: string | null;
  url: string | null;
  sortOrder: number;
};

export type MerchantAppAssetsResponse = {
  app: "merchant";
  assets: Record<string, MerchantAppAssetItem>;
  items: MerchantAppAssetItem[];
};

export const MX_ASSET = {
  authLogo: "auth.logo",
  partnerManageStores: "partner.manage_stores",
  ordersEmptyNew: "orders.empty_new",
  ordersEmptyActive: "orders.empty_active",
  ordersEmptyPreparing: "orders.empty_preparing",
  ordersEmptyReady: "orders.empty_ready",
  ordersEmptyPickedUp: "orders.empty_picked_up",
  ordersEmptyCompleted: "orders.empty_completed",
  ordersEmptyRto: "orders.empty_rto",
  ordersEmptyScheduled: "orders.empty_scheduled",
} as const;

let cache: Record<string, MerchantAppAssetItem> | null = null;
let loadPromise: Promise<Record<string, MerchantAppAssetItem>> | null = null;

export function invalidateMerchantAppAssetsCache(): void {
  cache = null;
  loadPromise = null;
}

export function resolveMerchantAssetUrl(
  item: MerchantAppAssetItem | undefined
): string | null {
  if (!item) return null;
  const signed = item.url?.trim() || item.proxyUrl?.trim();
  return signed || null;
}

export function getMerchantAppAssetUrl(key: string): string | null {
  if (!cache) return null;
  return resolveMerchantAssetUrl(cache[key]);
}

export function hasUploadedMerchantAppAsset(key: string): boolean {
  if (!cache) return false;
  const item = cache[key];
  if (!item) return false;
  return Boolean(item.url?.trim() || item.proxyUrl?.trim());
}

export async function loadMerchantAppAssets(options?: {
  refresh?: boolean;
}): Promise<Record<string, MerchantAppAssetItem>> {
  if (options?.refresh) {
    cache = null;
    loadPromise = null;
  }
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const res = await fetch("/api/public/merchant-app-assets", { cache: "no-store" });
    if (!res.ok) throw new Error(`merchant-app-assets HTTP ${res.status}`);
    const data = (await res.json()) as MerchantAppAssetsResponse;
    cache = data.assets ?? {};
    return cache;
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}
