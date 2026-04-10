import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, isNull } from "drizzle-orm";
import { customerAddresses } from "../../db/schema.js";
import { getEnv } from "../../config/env.js";
import { getRoute } from "../distance/distance.service.js";
import { computeDeliveryFee } from "../delivery-rate-card/deliveryRateCard.service.js";
import { getStoreBillingRates, getStoreByIdForOrder, getStoreByStoreId } from "../merchants/merchant.service.js";
import type { NormalizedOrderItem } from "../orders/orderNormalizer.js";
import { loadBillingDatasetUncached, getRulesetVersion } from "./billing.repository.js";
import { executeBillingPipeline } from "./executeBillingPipeline.js";
import { resolveGeoCustomerDeliveryFee } from "./geoPricingDelivery.js";
import { sumItemPackagingFromSnapshots } from "./packagingFromItems.js";
import {
  billingDatasetCacheKey,
  getCachedBillingDataset,
  setCachedBillingDataset,
} from "./ruleCache.js";
import type { BillContext, BillingResult } from "./types.js";

export type ComputeBillInput = {
  /** Required with addressId for customer checkout; use 0 for simulator-only paths. */
  customerId: number;
  merchantId: string;
  items: NormalizedOrderItem[];
  /** Customer-owned address (validates ownership when customerId > 0). */
  addressId?: number;
  /** Simulator / internal: drop coordinates when addressId omitted. */
  dropLat?: number;
  dropLon?: number;
  tipAmount?: number;
  donationAmount?: number;
  couponCode?: string | null;
  pickupLat?: number;
  pickupLon?: number;
  pickupAddressRaw?: string | null;
  now?: Date;
  useCache?: boolean;
  /** FOOD (default) | PARCEL | RIDE */
  serviceType?: string;
  /** Delivery city for rate cards / offers (simulator or parcel flows). With addressId, loaded from address. */
  cityName?: string | null;
  userSegment?: "NEW" | "EXISTING" | "ALL";
  /** Platform subscription add-on at checkout (applies SUBSCRIPTION pricing rules). */
  subscriptionOptIn?: boolean;
};

export type ComputeBillResult =
  | { ok: true; billing: BillingResult; snapshot: Record<string, unknown> }
  | { ok: false; code: string; message: string };

function lineCategoriesFromItems(items: NormalizedOrderItem[]): { categoryName: string | null }[] {
  return items.map((i) => {
    const snap = i.itemSnapshot;
    const cat =
      snap && typeof snap === "object" && snap !== null && "category_name" in snap
        ? String((snap as { category_name?: unknown }).category_name ?? "")
        : "";
    return { categoryName: cat.trim() || null };
  });
}

async function resolveMerchantStore(
  merchantId: string
): Promise<
  | { ok: true; merchantStoreId: number; parentId: number | null; pickupLat: number; pickupLon: number }
  | { ok: false; code: string; message: string }
> {
  const parsed = parseInt(String(merchantId).trim(), 10);
  if (!Number.isNaN(parsed) && parsed >= 1) {
    const store = await getStoreByIdForOrder(parsed);
    if (!store) {
      return { ok: false, code: "INVALID_MERCHANT", message: "Store not found." };
    }
    const plat = store.latitude ?? 0;
    const plon = store.longitude ?? 0;
    return { ok: true, merchantStoreId: parsed, parentId: store.parentId, pickupLat: plat, pickupLon: plon };
  }
  const store = await getStoreByStoreId(merchantId);
  if (!store) {
    return { ok: false, code: "INVALID_MERCHANT", message: "Store not found." };
  }
  const id = Number(store.id);
  const plat = store.latitude != null ? Number(store.latitude) : 0;
  const plon = store.longitude != null ? Number(store.longitude) : 0;
  return {
    ok: true,
    merchantStoreId: id,
    parentId: store.parent_id != null ? Number(store.parent_id) : null,
    pickupLat: plat,
    pickupLon: plon,
  };
}

export async function computeBillForOrder(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: ComputeBillInput
): Promise<ComputeBillResult> {
  const tipAmount = input.tipAmount ?? 0;
  const donationAmount = input.donationAmount ?? 0;
  const couponCode = input.couponCode?.trim() || null;

  const itemSubtotal = input.items.reduce((s, i) => s + i.basePrice * i.quantity, 0);
  const addonSubtotal = input.items.reduce((s, i) => {
    const lineAddon = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity * i.quantity, 0);
    return s + lineAddon;
  }, 0);
  const addonQtyTotal = input.items.reduce((s, i) => {
    const lineQty = i.addons.reduce((a, ad) => a + ad.quantity * i.quantity, 0);
    return s + lineQty;
  }, 0);

  const resolved = await resolveMerchantStore(input.merchantId);
  if (!resolved.ok) return resolved;

  let dropLat: number;
  let dropLon: number;
  let dropPostalCode: string | null = null;
  let cityName: string | null = input.cityName?.trim() || null;

  if (input.addressId != null) {
    if (!input.customerId || input.customerId < 1) {
      return { ok: false, code: "INVALID_ADDRESS_DATA", message: "Customer required for addressId." };
    }
    const [addrRow] = await db
      .select({
        latitude: customerAddresses.latitude,
        longitude: customerAddresses.longitude,
        city: customerAddresses.city,
        postalCode: customerAddresses.postalCode,
      })
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.id, input.addressId),
          eq(customerAddresses.customerId, input.customerId),
          eq(customerAddresses.isActive, true),
          isNull(customerAddresses.deletedAt)
        )
      )
      .limit(1);

    if (!addrRow) {
      return { ok: false, code: "INVALID_ADDRESS_DATA", message: "Address not found." };
    }

    dropLat = addrRow.latitude != null ? Number(addrRow.latitude) : 0;
    dropLon = addrRow.longitude != null ? Number(addrRow.longitude) : 0;
    dropPostalCode = addrRow.postalCode ? String(addrRow.postalCode).trim() : null;
    if (!cityName && addrRow.city) cityName = String(addrRow.city).trim() || null;
  } else if (input.dropLat != null && input.dropLon != null) {
    dropLat = input.dropLat;
    dropLon = input.dropLon;
  } else {
    return { ok: false, code: "INVALID_ADDRESS_DATA", message: "addressId or dropLat/dropLon required." };
  }
  const pickupLat = input.pickupLat ?? resolved.pickupLat;
  const pickupLon = input.pickupLon ?? resolved.pickupLon;
  const env = getEnv();
  const route = await getRoute({
    origin: { lat: pickupLat, lng: pickupLon },
    destination: { lat: dropLat, lng: dropLon },
    profile: "driving",
    mapboxToken: env.MAPBOX_ACCESS_TOKEN ?? undefined,
    osrmBaseUrl: env.OSRM_BASE_URL ?? undefined,
  });
  const distanceKm = route.distanceKm;

  const rates = await getStoreBillingRates(resolved.merchantStoreId);
  const packagingChargeAmount = rates?.packagingChargeAmount ?? 0;
  const deliveryChargePerKm = rates?.deliveryChargePerKm ?? 0; // legacy; keep for now
  const itemPackagingTotal = sumItemPackagingFromSnapshots(input.items);

  const serviceType = (input.serviceType ?? "FOOD").trim().toUpperCase();
  const userSegRaw = input.userSegment ?? "ALL";
  const userSegment: "NEW" | "EXISTING" | "ALL" =
    userSegRaw === "NEW" || userSegRaw === "EXISTING" ? userSegRaw : "ALL";

  const version = await getRulesetVersion(db);
  const cacheKey = billingDatasetCacheKey(version, resolved.merchantStoreId, couponCode, serviceType);
  const useCache = input.useCache !== false;
  let dataset = useCache ? getCachedBillingDataset(cacheKey) : null;
  if (!dataset) {
    dataset = await loadBillingDatasetUncached(db, {
      merchantStoreId: resolved.merchantStoreId,
      couponCode,
      serviceType,
    });
    if (useCache) setCachedBillingDataset(cacheKey, dataset);
  }

  const orderValue = itemSubtotal + addonSubtotal;

  // Delivery rate card engine (used by DELIVERY_RATE_CARD billing rule and as geo fallback).
  const deliveryFeeRes = await computeDeliveryFee(db, {
    serviceType: serviceType as any,
    cityName,
    pickup: { lat: pickupLat, lng: pickupLon },
    drop: { lat: dropLat, lng: dropLon },
    distanceKm,
    now: input.now ?? new Date(),
    orderValue,
    demandLevel: "UNKNOWN",
  });

  let deliveryFeeFromGeo: number | null = null;
  if (dropPostalCode) {
    const geo = await resolveGeoCustomerDeliveryFee({
      pincode: dropPostalCode,
      serviceTypeUpper: serviceType,
      distanceKm,
      orderValue,
      at: input.now ?? new Date(),
    });
    deliveryFeeFromGeo = geo != null ? geo.total : null;
  }

  const orderLines = input.items.map((i) => {
    const lineAddon = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity * i.quantity, 0);
    return { menuItemId: String(i.menuItemId), lineTotal: i.basePrice * i.quantity + lineAddon };
  });

  const ctx: BillContext = {
    itemSubtotal,
    addonSubtotal,
    addonQtyTotal,
    orderLines,
    distanceKm,
    merchantStoreId: resolved.merchantStoreId,
    merchantParentId: resolved.parentId,
    now: input.now ?? new Date(),
    userType: "customer",
    userSegment,
    couponCode,
    lineCategories: lineCategoriesFromItems(input.items),
    itemPackagingTotal,
    packagingChargeAmount,
    deliveryChargePerKm,
    serviceType,
    cityName,
    dropPostalCode,
    deliveryFeeFromRateCard: deliveryFeeRes.totalDeliveryFee,
    deliveryFeeFromGeo,
    tipAmount,
    donationAmount,
    subscriptionOptIn: input.subscriptionOptIn === true,
  };

  const billing = executeBillingPipeline(ctx, dataset);

  const snapshot = {
    ...billing,
    merchantStoreId: resolved.merchantStoreId,
    distanceKm,
    dropPostalCode,
    deliveryFeeFromGeo,
    computedAt: (input.now ?? new Date()).toISOString(),
  } as Record<string, unknown>;

  return { ok: true, billing, snapshot };
}

/** Legacy totals when billing rules flag is off (item + addon + tip + donation). */
export function computeLegacyGrandTotal(items: NormalizedOrderItem[], tipAmount: number, donationAmount: number): number {
  const itemTotal = items.reduce((s, i) => s + i.basePrice * i.quantity, 0);
  const addonTotal = items.reduce((s, i) => {
    const lineAddon = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity * i.quantity, 0);
    return s + lineAddon;
  }, 0);
  return Math.max(0, itemTotal + addonTotal + tipAmount + donationAmount);
}

/** Canonical customer bill calculator (same as `computeBillForOrder`; HTTP: POST /v1/billing/calculate). */
export { computeBillForOrder as calculateCustomerBill };
