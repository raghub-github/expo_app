import { getSql } from "../../db/client.js";
import { customerPriceFromBase } from "../commission/pricing.js";
import { resolveStoreCommission } from "../commission/commission.resolver.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";
import { listStores } from "./merchant.service.js";

export type FoodItemUnderPriceDto = {
  itemId: string;
  menuItemPk: number;
  name: string;
  imageUrl: string | null;
  price: number;
  basePrice: number | null;
  discountPercentage: number | null;
  storePublicId: string;
  storeName: string;
  isVeg: boolean;
  isPopular: boolean;
  itemTags: string[];
};

export type StoreFoodItemsUnderPriceDto = {
  storePublicId: string;
  storeName: string;
  avgRating: number | null;
  totalReviews: number | null;
  deliveryTime: string | null;
  distanceKm: number | null;
  items: FoodItemUnderPriceDto[];
};

type ItemRow = {
  id: number;
  store_pk: number;
  item_id: string;
  item_name: string;
  item_image_url: string | null;
  selling_price: string | number;
  base_price: string | number | null;
  discount_percentage: string | number | null;
  store_public_id: string;
  store_name: string;
  food_type: string | null;
  is_popular: boolean | null;
  item_tags: string[] | null;
};

const DEFAULT_COMMISSION_PERCENT = 15;

function normalizeStorePk(value: unknown): number {
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Same customer-facing markup as getMenuByStoreId (merchant.service). */
function customerPriceFromNetRupees(netRupees: number, commissionPercent: number): number {
  if (!Number.isFinite(netRupees) || netRupees <= 0) return 0;
  const { customerPaise } = customerPriceFromBase(
    Math.round(netRupees * 100),
    commissionPercent,
    "NEAREST_RUPEE"
  );
  return customerPaise / 100;
}

async function commissionPercentByStorePk(storePks: unknown[]): Promise<Map<number, number>> {
  const unique = [...new Set(storePks.map(normalizeStorePk).filter((id) => id > 0))];
  const map = new Map<number, number>();
  await Promise.all(
    unique.map(async (storePk) => {
      try {
        const commission = await resolveStoreCommission(storePk);
        map.set(storePk, commission.percent);
      } catch {
        map.set(storePk, DEFAULT_COMMISSION_PERCENT);
      }
    })
  );
  return map;
}

function mapItemRow(
  r: ItemRow,
  commissionPercent: number,
  maxPrice: number
): FoodItemUnderPriceDto | null {
  const netSelling = Number(r.selling_price);
  const price = customerPriceFromNetRupees(netSelling, commissionPercent);
  if (!Number.isFinite(price) || price <= 0 || price > maxPrice) return null;

  const netBase = r.base_price != null ? Number(r.base_price) : null;
  const customerBase =
    netBase != null && Number.isFinite(netBase) && netBase > 0
      ? customerPriceFromNetRupees(netBase, commissionPercent)
      : null;
  const basePrice =
    customerBase != null && Number.isFinite(customerBase) && customerBase > price
      ? customerBase
      : null;

  const discountRaw = r.discount_percentage != null ? Number(r.discount_percentage) : null;
  const discountPercentage =
    discountRaw != null && Number.isFinite(discountRaw) && discountRaw > 0 ? discountRaw : null;

  return {
    itemId: String(r.item_id),
    menuItemPk: Number(r.id),
    name: String(r.item_name),
    imageUrl: toAbsoluteClientMediaUrl(r.item_image_url),
    price,
    basePrice,
    discountPercentage,
    storePublicId: String(r.store_public_id),
    storeName: String(r.store_name),
    isVeg: String(r.food_type ?? "").toLowerCase().startsWith("veg"),
    isPopular: r.is_popular === true,
    itemTags: Array.isArray(r.item_tags) ? r.item_tags.filter(Boolean).map(String) : [],
  };
}

export async function listFoodItemsUnderPrice(params: {
  lat: number;
  lng: number;
  maxPrice: number;
  limit?: number;
  vegOnly?: boolean;
}): Promise<FoodItemUnderPriceDto[]> {
  const maxPrice = Math.max(1, Math.min(5000, Math.trunc(params.maxPrice)));
  const limit = Math.max(1, Math.min(24, params.limit ?? 12));

  const { items: stores } = await listStores({
    lat: params.lat,
    lng: params.lng,
    limit: 40,
    veg_mode: params.vegOnly,
    distanceMode: "air",
  });
  const storeIds = stores.map((s) => Number(s.id)).filter((id) => Number.isFinite(id) && id > 0);
  if (storeIds.length === 0) return [];

  const sql = getSql();
  const rows = await sql<ItemRow[]>`
    SELECT
      mmi.id,
      mmi.store_id AS store_pk,
      mmi.item_id,
      mmi.item_name,
      mmi.item_image_url,
      mmi.selling_price,
      mmi.base_price,
      mmi.discount_percentage,
      ms.store_id AS store_public_id,
      COALESCE(ms.store_display_name, ms.store_name) AS store_name,
      mmi.food_type,
      mmi.is_popular,
      mmi.item_tags
    FROM merchant_menu_items mmi
    INNER JOIN merchant_stores ms ON ms.id = mmi.store_id AND ms.deleted_at IS NULL
    WHERE mmi.store_id = ANY(${storeIds}::bigint[])
      AND mmi.is_deleted = false
      -- Entitlement gate: plan-locked items are hidden from customer discovery surfaces.
      AND COALESCE(mmi.is_locked_by_plan, false) = false
      AND COALESCE(mmi.in_stock, true) = true
      AND mmi.selling_price IS NOT NULL
      AND mmi.selling_price > 0
      AND mmi.selling_price <= ${maxPrice}
      ${params.vegOnly ? sql`AND LOWER(COALESCE(mmi.food_type, '')) LIKE 'veg%'` : sql``}
    ORDER BY mmi.is_recommended DESC NULLS LAST, mmi.selling_price ASC, mmi.id ASC
    LIMIT ${limit * 3}
  `;

  const commissionMap = await commissionPercentByStorePk(rows.map((r) => r.store_pk));
  const items: FoodItemUnderPriceDto[] = [];
  for (const row of rows) {
    const storePk = normalizeStorePk(row.store_pk);
    const percent = commissionMap.get(storePk) ?? DEFAULT_COMMISSION_PERCENT;
    const mapped = mapItemRow(row, percent, maxPrice);
    if (mapped) items.push(mapped);
    if (items.length >= limit) break;
  }
  return items;
}

export async function listFoodItemsUnderPriceGrouped(params: {
  lat: number;
  lng: number;
  maxPrice: number;
  vegOnly?: boolean;
  maxStores?: number;
  itemsPerStore?: number;
}): Promise<StoreFoodItemsUnderPriceDto[]> {
  const maxPrice = Math.max(1, Math.min(5000, Math.trunc(params.maxPrice)));
  const maxStores = Math.max(1, Math.min(20, params.maxStores ?? 15));
  const itemsPerStore = Math.max(1, Math.min(10, params.itemsPerStore ?? 6));

  const { items: stores } = await listStores({
    lat: params.lat,
    lng: params.lng,
    limit: 40,
    veg_mode: params.vegOnly,
    distanceMode: "air",
  });
  const storeIds = stores
    .map((s) => Number((s as { id: number }).id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (storeIds.length === 0) return [];

  const storeMetaByPublicId = new Map(
    stores.map((s) => {
      const row = s as {
        store_id: string;
        store_name: string;
        store_display_name?: string | null;
        distance_km?: number | null;
        eta_min_minutes?: number | null;
        eta_max_minutes?: number | null;
      };
      const deliveryTime =
        row.eta_min_minutes != null && row.eta_max_minutes != null
          ? `${Math.round(Number(row.eta_min_minutes))}-${Math.round(Number(row.eta_max_minutes))} mins`
          : null;
      return [
        String(row.store_id),
        {
          storeName: row.store_display_name ?? row.store_name,
          avgRating: null as number | null,
          totalReviews: null as number | null,
          deliveryTime,
          distanceKm: row.distance_km ?? null,
        },
      ] as const;
    })
  );

  const sql = getSql();
  const rowLimit = maxStores * itemsPerStore * 4;
  const rows = await sql<ItemRow[]>`
    SELECT
      mmi.id,
      mmi.store_id AS store_pk,
      mmi.item_id,
      mmi.item_name,
      mmi.item_image_url,
      mmi.selling_price,
      mmi.base_price,
      mmi.discount_percentage,
      ms.store_id AS store_public_id,
      COALESCE(ms.store_display_name, ms.store_name) AS store_name,
      mmi.food_type,
      mmi.is_popular,
      mmi.item_tags
    FROM merchant_menu_items mmi
    INNER JOIN merchant_stores ms ON ms.id = mmi.store_id AND ms.deleted_at IS NULL
    WHERE mmi.store_id = ANY(${storeIds}::bigint[])
      AND mmi.is_deleted = false
      -- Entitlement gate: plan-locked items are hidden from customer discovery surfaces.
      AND COALESCE(mmi.is_locked_by_plan, false) = false
      AND COALESCE(mmi.in_stock, true) = true
      AND mmi.selling_price IS NOT NULL
      AND mmi.selling_price > 0
      AND mmi.selling_price <= ${maxPrice}
      ${params.vegOnly ? sql`AND LOWER(COALESCE(mmi.food_type, '')) LIKE 'veg%'` : sql``}
    ORDER BY ms.store_id, mmi.is_recommended DESC NULLS LAST, mmi.selling_price ASC, mmi.id ASC
    LIMIT ${rowLimit}
  `;

  const commissionMap = await commissionPercentByStorePk(rows.map((r) => r.store_pk));
  const grouped = new Map<string, FoodItemUnderPriceDto[]>();
  for (const row of rows) {
    const storePublicId = String(row.store_public_id);
    if (!grouped.has(storePublicId) && grouped.size >= maxStores) continue;
    const bucket = grouped.get(storePublicId) ?? [];
    if (bucket.length >= itemsPerStore) continue;
    const storePk = normalizeStorePk(row.store_pk);
    const percent = commissionMap.get(storePk) ?? DEFAULT_COMMISSION_PERCENT;
    const mapped = mapItemRow(row, percent, maxPrice);
    if (!mapped) continue;
    bucket.push(mapped);
    grouped.set(storePublicId, bucket);
  }

  return [...grouped.entries()]
    .filter(([, items]) => items.length > 0)
    .slice(0, maxStores)
    .map(([storePublicId, items]) => {
      const meta = storeMetaByPublicId.get(storePublicId);
      return {
        storePublicId,
        storeName: meta?.storeName ?? items[0]?.storeName ?? storePublicId,
        avgRating: meta?.avgRating ?? null,
        totalReviews: meta?.totalReviews ?? null,
        deliveryTime: meta?.deliveryTime ?? null,
        distanceKm: meta?.distanceKm ?? null,
        items,
      };
    });
}
