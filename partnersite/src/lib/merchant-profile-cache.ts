import type { MerchantStore } from '@/lib/merchantStore';
import { normalizeMerchantStoreMediaUrl, normalizeStoreDocumentRowUrls } from '@/lib/r2';

export type CachedMerchantProfile = {
  store: MerchantStore;
  operatingHours: unknown[];
  storeDocuments: unknown | null;
  bankAccounts: unknown[];
  fetchedAt: number;
};

const CACHE_KEY = (storeId: string) => `mx_merchant_profile_v1_${storeId.trim()}`;

export function coerceNumeric(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

/** Postgres `numeric` often arrives as `"7.00"` — never treat that as missing. */
export function coerceDeliveryRadiusKm(raw: unknown): number | null {
  const n = coerceNumeric(raw);
  if (n == null || n <= 0) return null;
  return n;
}

export function formatDeliveryRadiusKm(raw: unknown): string {
  const n = coerceDeliveryRadiusKm(raw);
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

export function normalizeProfileStore(store: MerchantStore): MerchantStore {
  const bannerUrl = normalizeMerchantStoreMediaUrl(store.banner_url) ?? store.banner_url;
  const galleryImages = Array.isArray(store.gallery_images)
    ? store.gallery_images
        .map((u) => normalizeMerchantStoreMediaUrl(u) ?? u)
        .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : store.gallery_images;
  const radius = coerceDeliveryRadiusKm(store.delivery_radius_km);
  const minOrder = coerceNumeric(store.min_order_amount);
  const prep = coerceNumeric(store.avg_preparation_time_minutes);
  return {
    ...store,
    banner_url: bannerUrl || store.banner_url,
    gallery_images: (galleryImages ?? store.gallery_images) as MerchantStore["gallery_images"],
    ...(radius != null ? { delivery_radius_km: radius } : {}),
    ...(minOrder != null ? { min_order_amount: minOrder } : {}),
    ...(prep != null ? { avg_preparation_time_minutes: prep } : {}),
  };
}

export function clearCachedMerchantProfile(storeId: string): void {
  if (typeof sessionStorage === "undefined" || !storeId.trim()) return;
  try {
    sessionStorage.removeItem(CACHE_KEY(storeId.trim()));
  } catch {
    /* ignore */
  }
}

export function patchCachedMerchantProfileStore(
  storeId: string,
  patch: Partial<MerchantStore>
): void {
  const cached = readCachedMerchantProfile(storeId);
  if (!cached) return;
  writeCachedMerchantProfile(storeId, {
    operatingHours: cached.operatingHours,
    storeDocuments: cached.storeDocuments,
    bankAccounts: cached.bankAccounts,
    store: { ...cached.store, ...patch },
  });
}

export function readCachedMerchantProfile(storeId: string): CachedMerchantProfile | null {
  if (typeof sessionStorage === 'undefined' || !storeId.trim()) return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY(storeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedMerchantProfile;
    if (!parsed?.store || typeof parsed.store !== 'object') return null;
    const cachedPublicId = (parsed.store as MerchantStore).store_id;
    if (cachedPublicId && String(cachedPublicId).trim() !== storeId.trim()) return null;
    const docs =
      parsed.storeDocuments && typeof parsed.storeDocuments === 'object'
        ? normalizeStoreDocumentRowUrls(parsed.storeDocuments as Record<string, unknown>)
        : parsed.storeDocuments;
    return {
      ...parsed,
      store: normalizeProfileStore(parsed.store as MerchantStore),
      operatingHours: Array.isArray(parsed.operatingHours) ? parsed.operatingHours : [],
      storeDocuments: docs,
      bankAccounts: Array.isArray(parsed.bankAccounts) ? parsed.bankAccounts : [],
    };
  } catch {
    return null;
  }
}

export function writeCachedMerchantProfile(
  storeId: string,
  bundle: Omit<CachedMerchantProfile, 'fetchedAt'>
): void {
  if (typeof sessionStorage === 'undefined' || !storeId.trim()) return;
  const publicId = storeId.trim();
  if (bundle.store?.store_id && String(bundle.store.store_id).trim() !== publicId) return;
  const docs =
    bundle.storeDocuments && typeof bundle.storeDocuments === 'object'
      ? normalizeStoreDocumentRowUrls(bundle.storeDocuments as Record<string, unknown>)
      : bundle.storeDocuments;
  try {
    sessionStorage.setItem(
      CACHE_KEY(publicId),
      JSON.stringify({
        ...bundle,
        storeDocuments: docs,
        fetchedAt: Date.now(),
      } satisfies CachedMerchantProfile)
    );
  } catch {
    /* ignore quota */
  }
}

/** Fetch legal documents for the selected store via authenticated API (store-scoped + proxy URLs). */
export async function fetchStoreDocumentsViaApi(publicStoreId: string): Promise<unknown | null> {
  const res = await fetch(
    `/api/merchant/store-documents?storeId=${encodeURIComponent(publicStoreId.trim())}`,
    { credentials: 'include' }
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { documents?: unknown };
  return data.documents ?? null;
}

/** Warm profile bundle before navigating to /partners/profile. */
export async function prefetchMerchantProfile(storeId: string): Promise<void> {
  if (!storeId.trim() || typeof window === 'undefined') return;
  try {
    const res = await fetch(`/api/merchant/store-record?storeId=${encodeURIComponent(storeId)}`, {
      credentials: 'include',
    });
    if (!res.ok) return;
    const storeData = (await res.json()) as MerchantStore;
    const internalId = storeData?.id;
    if (!internalId) return;

    const mod = await import('@/lib/database');
    const [hoursData, docs, banks] = await Promise.all([
      mod.fetchStoreOperatingHoursViaApi(internalId).catch(() => []),
      fetchStoreDocumentsViaApi(storeId).catch(() => null),
      mod.fetchStoreBankAccounts(internalId).catch(() => []),
    ]);

    writeCachedMerchantProfile(storeId, {
      store: normalizeProfileStore(storeData),
      operatingHours: Array.isArray(hoursData) ? hoursData : [],
      storeDocuments: docs,
      bankAccounts: Array.isArray(banks) ? banks : [],
    });
  } catch {
    /* non-blocking prefetch */
  }
}
