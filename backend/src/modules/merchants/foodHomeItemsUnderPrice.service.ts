import { getSql } from "../../db/client.js";
import { customerPriceFromBase } from "../commission/pricing.js";
import { resolveStoreCommission } from "../commission/commission.resolver.js";
import { resolveItemPricing } from "../pricing/canonicalItemPricing.js";
import { loadMerchantOffersForPricing } from "../pricing/loadMerchantOffersForPricing.js";
import type { MerchantOfferRow, PlatformOfferRow } from "../billing/types.js";
import { overlayFlashSaleOnMenuRows } from "../billing/flashSaleApply.js";
import { loadActiveFoodFlashSalesForStore } from "../billing/flashSaleRedemption.service.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";
import { foodTypeIsListedAsVeg } from "../../lib/food-order-veg.js";
import { listStores } from "./merchant.service.js";
import {
  getCustomerVisibleApprovalExpr,
  getCustomerVisibleItemImageExpr,
} from "../../lib/customer-menu-item-visibility.js";
import {
  customerListStoreTypesForSql,
  matchesCustomerMerchantListStoreType,
} from "./merchantStoreTypeFilters.js";

export type FoodItemUnderPriceDto = {
  itemId: string;
  menuItemPk: number;
  name: string;
  imageUrl: string | null;
  /** Payable customer unit (Boost then FLASH_SALE overlay when active). */
  price: number;
  /** Strike / original customer unit when Boost or Flash Sale reduces `price`. */
  basePrice: number | null;
  discountPercentage: number | null;
  storePublicId: string;
  storeName: string;
  isVeg: boolean;
  isPopular: boolean;
  itemTags: string[];
  flashSale?: {
    offerId: number;
    originalCustomerUnit: number;
    flashPrice: number;
    maxFlashQuantity?: number;
  } | null;
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
  store_type: string | null;
  food_type: string | null;
  is_popular: boolean | null;
  item_tags: string[] | null;
};

const DEFAULT_COMMISSION_PERCENT = 15;

/** Meals-under / food-home discovery — never include grocery (or other non-food) stores. */
async function filterToFoodStoreIds(storeIds: number[]): Promise<number[]> {
  if (storeIds.length === 0) return [];
  const foodTypes = customerListStoreTypesForSql("FOOD");
  if (!foodTypes?.length) return storeIds;
  const sql = getSql();
  const rows = await sql<{ id: number }[]>`
    SELECT id
    FROM merchant_stores
    WHERE id = ANY(${storeIds}::bigint[])
      AND deleted_at IS NULL
      AND upper(trim(COALESCE(store_type::text, 'FOOD'))) = ANY(${foodTypes}::text[])
      AND upper(trim(COALESCE(store_type::text, 'FOOD'))) <> 'GROCERY'
  `;
  return rows
    .map((r) => Number(r.id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

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
  maxPrice: number,
  offers: MerchantOfferRow[],
  flashOffers: PlatformOfferRow[]
): FoodItemUnderPriceDto | null {
  const netSelling = Number(r.selling_price);
  const priced = resolveItemPricing({
    baseCtmUnit: netSelling,
    quantity: 1,
    commissionPercent,
    offers,
    menuItemId: Number(r.id),
    extraAliases: r.item_id ? [String(r.item_id)] : [],
  });
  let price = priced.customerItemPriceUnit;
  if (!Number.isFinite(price) || price <= 0) return null;

  const boostStrike = priced.merchantOfferType === "BOOST" ? priced.customerStrikeUnit : null;
  const customerBase =
    boostStrike != null && boostStrike > price
      ? boostStrike
      : r.base_price != null
        ? customerPriceFromNetRupees(Number(r.base_price), commissionPercent)
        : null;
  let basePrice =
    customerBase != null && Number.isFinite(customerBase) && customerBase > price
      ? customerBase
      : null;

  let flashSale: FoodItemUnderPriceDto["flashSale"] = null;
  if (flashOffers.length > 0) {
    const flashRow = {
      id: Number(r.id),
      item_id: r.item_id,
      selling_price: price.toFixed(2),
      in_stock: true,
      is_active: true,
    };
    overlayFlashSaleOnMenuRows([flashRow], flashOffers);
    const flashUnit = parseFloat(String(flashRow.selling_price));
    const flashBlob = (flashRow as { flash_sale?: Record<string, unknown> }).flash_sale;
    if (
      Number.isFinite(flashUnit) &&
      flashUnit >= 0 &&
      flashUnit < price - 0.0001 &&
      flashBlob &&
      typeof flashBlob === "object"
    ) {
      const original =
        Number(
          (flashRow as { customer_strike_price?: string }).customer_strike_price ??
            flashBlob.original_customer_unit ??
            price
        ) || price;
      flashSale = {
        offerId: Number(flashBlob.offer_id),
        originalCustomerUnit: original,
        flashPrice: flashUnit,
        maxFlashQuantity: (() => {
          const n = Math.floor(Number(flashBlob.max_flash_quantity ?? flashBlob.maxFlashQuantity));
          return Number.isInteger(n) && n >= 1 ? n : 1;
        })(),
      };
      if (!Number.isInteger(flashSale.offerId) || flashSale.offerId < 1) {
        flashSale = null;
      } else {
        basePrice = original > flashUnit ? original : basePrice;
        price = flashUnit;
      }
    }
  }

  if (price > maxPrice) return null;

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
    isVeg: foodTypeIsListedAsVeg(r.food_type),
    isPopular: r.is_popular === true,
    itemTags: Array.isArray(r.item_tags) ? r.item_tags.filter(Boolean).map(String) : [],
    flashSale,
  };
}

async function flashOfferCacheForStores(
  storePks: number[],
  customerId?: number | null
): Promise<Map<number, PlatformOfferRow[]>> {
  const unique = [...new Set(storePks.filter((id) => id > 0))];
  const map = new Map<number, PlatformOfferRow[]>();
  await Promise.all(
    unique.map(async (storePk) => {
      try {
        map.set(storePk, await loadActiveFoodFlashSalesForStore(storePk, customerId));
      } catch {
        map.set(storePk, []);
      }
    })
  );
  return map;
}

export async function listFoodItemsUnderPrice(params: {
  lat: number;
  lng: number;
  maxPrice: number;
  limit?: number;
  vegOnly?: boolean;
  customerId?: number | null;
}): Promise<FoodItemUnderPriceDto[]> {
  const maxPrice = Math.max(1, Math.min(5000, Math.trunc(params.maxPrice)));
  const limit = Math.max(1, Math.min(60, params.limit ?? 12));

  const { items: stores } = await listStores({
    lat: params.lat,
    lng: params.lng,
    limit: 80,
    veg_mode: params.vegOnly,
    distanceMode: "road",
  });
  const storeIds = await filterToFoodStoreIds(
    stores.map((s) => Number(s.id)).filter((id) => Number.isFinite(id) && id > 0)
  );
  if (storeIds.length === 0) return [];

  const sql = getSql();
  const customerImage = getCustomerVisibleItemImageExpr(sql, "mmi");
  const customerApproval = getCustomerVisibleApprovalExpr(sql, "mmi");
  const foodTypes = customerListStoreTypesForSql("FOOD") ?? [];
  const rows = await sql<ItemRow[]>`
    SELECT
      mmi.id,
      mmi.store_id AS store_pk,
      mmi.item_id,
      mmi.item_name,
      ${customerImage} AS item_image_url,
      mmi.selling_price,
      mmi.base_price,
      mmi.discount_percentage,
      ms.store_id AS store_public_id,
      COALESCE(ms.store_display_name, ms.store_name) AS store_name,
      upper(trim(COALESCE(ms.store_type::text, 'FOOD'))) AS store_type,
      mmi.food_type,
      mmi.is_popular,
      mmi.item_tags
    FROM merchant_menu_items mmi
    INNER JOIN merchant_stores ms ON ms.id = mmi.store_id AND ms.deleted_at IS NULL
      AND COALESCE(ms.has_customer_visible_menu, true) = true
      AND upper(trim(COALESCE(ms.store_type::text, 'FOOD'))) = ANY(${foodTypes}::text[])
      AND upper(trim(COALESCE(ms.store_type::text, 'FOOD'))) <> 'GROCERY'
    WHERE mmi.store_id = ANY(${storeIds}::bigint[])
      AND mmi.is_deleted = false
      -- Entitlement gate: plan-locked items are hidden from customer discovery surfaces.
      AND COALESCE(mmi.is_locked_by_plan, false) = false
      AND COALESCE(mmi.in_stock, true) = true
      AND ${customerApproval}
      AND mmi.is_active = true
      AND mmi.selling_price IS NOT NULL
      AND mmi.selling_price > 0
      AND mmi.selling_price <= ${maxPrice}
      ${params.vegOnly ? sql`AND LOWER(COALESCE(mmi.food_type, '')) LIKE 'veg%'` : sql``}
    ORDER BY mmi.is_recommended DESC NULLS LAST, mmi.selling_price ASC, mmi.id ASC
    LIMIT ${limit * 3}
  `;

  const commissionMap = await commissionPercentByStorePk(rows.map((r) => r.store_pk));
  const offerCache = new Map<number, MerchantOfferRow[]>();
  const flashCache = await flashOfferCacheForStores(
    rows.map((r) => normalizeStorePk(r.store_pk)),
    params.customerId
  );
  const items: FoodItemUnderPriceDto[] = [];
  for (const row of rows) {
    const storePk = normalizeStorePk(row.store_pk);
    const percent = commissionMap.get(storePk) ?? DEFAULT_COMMISSION_PERCENT;
    if (!offerCache.has(storePk)) {
      offerCache.set(storePk, await loadMerchantOffersForPricing(storePk));
    }
    if (!matchesCustomerMerchantListStoreType(row.store_type, "FOOD")) continue;
    const mapped = mapItemRow(
      row,
      percent,
      maxPrice,
      offerCache.get(storePk) ?? [],
      flashCache.get(storePk) ?? []
    );
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
  customerId?: number | null;
}): Promise<StoreFoodItemsUnderPriceDto[]> {
  const maxPrice = Math.max(1, Math.min(5000, Math.trunc(params.maxPrice)));
  // Classic explore rails need more than 20 nearby stores; keep a sane upper bound.
  const maxStores = Math.max(1, Math.min(50, params.maxStores ?? 15));
  const itemsPerStore = Math.max(1, Math.min(10, params.itemsPerStore ?? 6));

  const { items: stores } = await listStores({
    lat: params.lat,
    lng: params.lng,
    limit: 80,
    veg_mode: params.vegOnly,
    distanceMode: "road",
  });
  const storeIds = await filterToFoodStoreIds(
    stores
      .map((s) => Number((s as { id: number }).id))
      .filter((id) => Number.isFinite(id) && id > 0)
  );
  if (storeIds.length === 0) return [];

  const foodIdSet = new Set(storeIds);
  const storeMetaByPublicId = new Map(
    stores
      .filter((s) => foodIdSet.has(Number((s as { id: number }).id)))
      .map((s) => {
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
  const customerImage = getCustomerVisibleItemImageExpr(sql, "mmi");
  const customerApproval = getCustomerVisibleApprovalExpr(sql, "mmi");
  const foodTypes = customerListStoreTypesForSql("FOOD") ?? [];
  const rowLimit = maxStores * itemsPerStore * 4;
  const rows = await sql<ItemRow[]>`
    SELECT
      mmi.id,
      mmi.store_id AS store_pk,
      mmi.item_id,
      mmi.item_name,
      ${customerImage} AS item_image_url,
      mmi.selling_price,
      mmi.base_price,
      mmi.discount_percentage,
      ms.store_id AS store_public_id,
      COALESCE(ms.store_display_name, ms.store_name) AS store_name,
      upper(trim(COALESCE(ms.store_type::text, 'FOOD'))) AS store_type,
      mmi.food_type,
      mmi.is_popular,
      mmi.item_tags
    FROM merchant_menu_items mmi
    INNER JOIN merchant_stores ms ON ms.id = mmi.store_id AND ms.deleted_at IS NULL
      AND COALESCE(ms.has_customer_visible_menu, true) = true
      AND upper(trim(COALESCE(ms.store_type::text, 'FOOD'))) = ANY(${foodTypes}::text[])
      AND upper(trim(COALESCE(ms.store_type::text, 'FOOD'))) <> 'GROCERY'
    WHERE mmi.store_id = ANY(${storeIds}::bigint[])
      AND mmi.is_deleted = false
      -- Entitlement gate: plan-locked items are hidden from customer discovery surfaces.
      AND COALESCE(mmi.is_locked_by_plan, false) = false
      AND COALESCE(mmi.in_stock, true) = true
      AND ${customerApproval}
      AND mmi.is_active = true
      AND mmi.selling_price IS NOT NULL
      AND mmi.selling_price > 0
      AND mmi.selling_price <= ${maxPrice}
      ${params.vegOnly ? sql`AND LOWER(COALESCE(mmi.food_type, '')) LIKE 'veg%'` : sql``}
    ORDER BY ms.store_id, mmi.is_recommended DESC NULLS LAST, mmi.selling_price ASC, mmi.id ASC
    LIMIT ${rowLimit}
  `;

  const commissionMap = await commissionPercentByStorePk(rows.map((r) => r.store_pk));
  const offerCache = new Map<number, MerchantOfferRow[]>();
  const flashCache = await flashOfferCacheForStores(
    rows.map((r) => normalizeStorePk(r.store_pk)),
    params.customerId
  );
  const grouped = new Map<string, FoodItemUnderPriceDto[]>();
  for (const row of rows) {
    const storePublicId = String(row.store_public_id);
    if (!grouped.has(storePublicId) && grouped.size >= maxStores) continue;
    const bucket = grouped.get(storePublicId) ?? [];
    if (bucket.length >= itemsPerStore) continue;
    const storePk = normalizeStorePk(row.store_pk);
    const percent = commissionMap.get(storePk) ?? DEFAULT_COMMISSION_PERCENT;
    if (!offerCache.has(storePk)) {
      offerCache.set(storePk, await loadMerchantOffersForPricing(storePk));
    }
    const mapped = mapItemRow(
      row,
      percent,
      maxPrice,
      offerCache.get(storePk) ?? [],
      flashCache.get(storePk) ?? []
    );
    if (!mapped) continue;
    if (!matchesCustomerMerchantListStoreType(row.store_type, "FOOD")) continue;
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
