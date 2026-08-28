import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, isNull } from "drizzle-orm";
import { customerAddresses } from "../../db/schema.js";
import { getEnv } from "../../config/env.js";
import { getStoreBillingRates, getStoreByIdForOrder, getStoreByStoreId } from "../merchants/merchant.service.js";
import type { NormalizedOrderItem } from "../orders/orderNormalizer.js";
import { rewriteCartPricesAuthoritatively, loadMrpIneligibleMenuItemIds, loadMenuItemIdAliases } from "./serverAuthoritativePricing.js";
import { isStoreFundedItemOfferType, parseCanonicalPricing } from "../pricing/canonicalItemPricing.js";
import {
  markOrderLinesDiscountEligibility,
  cartPromoQualifyingSubtotal,
  eligibleSubtotal,
} from "./discountEligibility.js";
import { getSql } from "../../db/client.js";
import {
  loadBillingDatasetUncached,
  getRulesetVersion,
  listActiveCustomerCoupons,
  loadMerchantOfferUsagesByUser,
} from "./billing.repository.js";
import {
  loadPlatformOfferLifetimeUseCounts,
  loadPlatformOfferUsageCountsForUser,
} from "./platformOfferUsage.service.js";
import { loadCheckoutCouponUsageSnapshot, loadCheckoutCouponUsageSnapshotsForCustomer } from "./checkoutCouponUsage.service.js";
import { sanitizeCheckoutCouponConfig } from "./checkoutCouponConfig.js";
import {
  evaluateCheckoutCouponEligibility,
} from "./checkoutCouponEligibility.js";
import { executeBillingPipeline } from "./executeBillingPipeline.js";
import {
  applyDynamicSurchargesToBilling,
  resolveActiveDynamicSurchargesFromRefs,
} from "../../lib/dynamic-pricing.js";
import {
  customerHasSubscriptionOfferAccess,
  listEligiblePlatformOffersForCheckout,
  platformOfferConditionsPass,
  platformOfferConflictsWithSubscriptionFreeDelivery,
  platformOfferGeoMatches,
  platformOfferMinOrderBase,
  isPlatformOfferHardVisibilityRejection,
  platformOfferLocationVisible,
  platformOfferServiceMatches,
} from "./platformOffersApply.js";
import { platformOfferRequiresFirstRideOnly } from "./platformOfferFirstRide.js";
import { countCompletedParcelsForCustomer, rideParcelPromoPasses } from "./rideParcelPromoApply.js";
import {
  countDeliveredOrdersForCustomer,
  userSegmentFromOrderCount,
} from "./customerOrderSegment.js";
import { listMerchantOffersForCheckout } from "./merchantOffersCheckout.js";
import {
  resolveOfferDisplaySurface,
  parseMenuItemIdsFromMeta,
  parseConditionsModeFromMeta,
} from "../offers/offer-display-surface.js";
import { buildCheckoutOfferDisplayTitle } from "../merchants/merchant-offer-headline.js";
import {
  resolveDropGeoRefsFromPincode,
  resolvePlatformOfferGeoBindingEffectiveIds,
} from "./geoRefFromPincode.js";
import { canonicalStoreToCustomerRouteArgs, getRoute } from "../distance/distance.service.js";
import { computeItemPackagingTotal } from "./packagingFromItems.js";
import { formatDeliverySlabExplainSubtext } from "../delivery-slab-pricing/formatDeliverySlabExplain.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
import { getDeliveryFallbackRates } from "../delivery/deliveryFallback.config.js";
import {
  billingDatasetCacheKey,
  getCachedBillingDataset,
  setCachedBillingDataset,
} from "./ruleCache.js";
import type { BillContext, BillingResult, DiscountRow, PlatformOfferRow } from "./types.js";
import { platformOfferCouponCodesMatch } from "./platformOfferCouponCode.js";
import { getSupabase } from "../../lib/supabase.js";
import { resolveStoreDeliveryQuote } from "../distance/storeQuote.service.js";
import { reverseGeocodeCoords } from "../../services/mapbox/geocoding.js";
import { resolveGeoLocation } from "./geoLocationResolver.js";

/**
 * Treat em-dash, hyphen, and "no value" tokens as null. The customer app stores
 * "—" in customer_addresses.{state,city,postal_code} when reverse-geocoding yields
 * no value for those required-NOT-NULL columns. Without this, geo lookups would
 * try to match "—" against real states/pincodes and fail silently.
 */
function sanitizePlaceholder(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  if (t === "—" || t === "–" || t === "-" || t === "--" || t === "---") return null;
  const lower = t.toLowerCase();
  if (lower === "n/a" || lower === "na" || lower === "null" || lower === "none" || lower === "unknown") return null;
  return t;
}

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
  /** Customer subscription plan selected at checkout (DB-driven; replaces hardcoded GMitra Plus). */
  subscriptionPlanId?: number;
  subscriptionBillingCycle?: "weekly" | "monthly" | "yearly";
  /**
   * Delivery type chosen at checkout. When 'self_pickup' the customer collects
   * from the store and the engine waives the delivery fee (and any
   * delivery-fee GST line) entirely. Default: 'delivery'.
   */
  deliveryType?: "delivery" | "self_pickup";
  /** Must match coupon.offer_audience for promo codes (default CUSTOMER). */
  checkoutAudience?: "CUSTOMER" | "MERCHANT" | "RIDER";
  /** Prior redemptions of this coupon by the current actor (per-user cap). Omitted = 0 for quotes. */
  couponRedemptionsByUser?: number;
  /** Checkout UI: apply this platform offer instead of auto-picking the best. */
  selectedPlatformOfferId?: number | null;
  selectedMerchantOfferId?: number | null;
  /** When true, skip auto platform/merchant offers (customer tapped Remove). */
  forceNoAutoOffer?: boolean;
  /** Parcel weight (kg) for weight-based platform offers. */
  parcelWeightKg?: number | null;
  parcelSpeed?: string | null;
  parcelScope?: string | null;
  /** Checkout payment mode for payment-mode platform offers. */
  paymentMode?: string | null;
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

async function getStoreDeliveryRadiusKm(merchantStoreId: number): Promise<number | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("merchant_stores")
      .select("delivery_radius_km")
      .eq("id", merchantStoreId)
      .single();
    if (error || !data) return null;
    const raw = (data as { delivery_radius_km?: number | string | null }).delivery_radius_km;
    const n = raw == null ? null : typeof raw === "number" ? raw : parseFloat(String(raw));
    return Number.isFinite(n ?? NaN) && (n as number) > 0 ? (n as number) : null;
  } catch {
    return null;
  }
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

async function loadPackagingChargesFromMenuItems(args: {
  merchantStoreId: number;
  menuItemIds: number[];
}): Promise<{ perUnitById: Map<number, number>; foundIds: Set<number> }> {
  const ids = Array.from(new Set(args.menuItemIds.filter((x) => Number.isInteger(x) && x > 0)));
  if (ids.length === 0) return { perUnitById: new Map(), foundIds: new Set() };
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("merchant_menu_items")
      .select("id, packaging_charges")
      .eq("store_id", args.merchantStoreId)
      .in("id", ids);
    if (error || !data) return { perUnitById: new Map(), foundIds: new Set() };
    const out = new Map<number, number>();
    const found = new Set<number>();
    for (const r of data as Array<{ id: number; packaging_charges?: unknown }>) {
      found.add(Number(r.id));
      const raw = r.packaging_charges;
      const n = raw == null ? 0 : typeof raw === "number" ? raw : parseFloat(String(raw));
      if (Number.isFinite(n) && n > 0) out.set(Number(r.id), n);
    }
    return { perUnitById: out, foundIds: found };
  } catch {
    return { perUnitById: new Map(), foundIds: new Set() };
  }
}

export async function computeBillForOrder(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: ComputeBillInput
): Promise<ComputeBillResult> {
  function normalizeCity(raw: unknown): string | null {
    if (raw == null) return null;
    const s = String(raw).replace(/\u2014/g, "").trim(); // strip EM_DASH placeholder
    return s.length ? s : null;
  }
  function normalizePincode(raw: unknown): string | null {
    if (raw == null) return null;
    const digits = String(raw).replace(/\D/g, "").trim();
    // India pincodes are 6 digits; keep generic >=3 gate to match geo resolver.
    return digits.length >= 3 ? digits : null;
  }

  const tipAmount = input.tipAmount ?? 0;
  const donationAmount = input.donationAmount ?? 0;
  const couponCode = input.couponCode?.trim() || null;

  const resolved = await resolveMerchantStore(input.merchantId);
  if (!resolved.ok) return resolved;

  // Server-authoritative price re-validation: ignore whatever basePrice the
  // client carried in the cart (it might be stale from before a price/commission
  // change, or tampered with), and re-fetch the merchant's stored net price
  // for each line, then apply the current commission. This guarantees the
  // bill amount equals what the customer saw on the menu listing.
  const authoritativeItems = await rewriteCartPricesAuthoritatively(
    resolved.merchantStoreId,
    input.items,
  );
  input = { ...input, items: authoritativeItems };

  const itemSubtotal = input.items.reduce((s, i) => s + i.basePrice * i.quantity, 0);
  const addonSubtotal = input.items.reduce((s, i) => {
    const lineAddon = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity * i.quantity, 0);
    return s + lineAddon;
  }, 0);
  const addonQtyTotal = input.items.reduce((s, i) => {
    const lineQty = i.addons.reduce((a, ad) => a + ad.quantity * i.quantity, 0);
    return s + lineQty;
  }, 0);

  let dropLat: number;
  let dropLon: number;
  let dropPostalCode: string | null = null;
  let dropStateName: string | null = null;
  let cityName: string | null = normalizeCity(input.cityName) || null;

  if (input.addressId != null) {
    if (!input.customerId || input.customerId < 1) {
      return { ok: false, code: "INVALID_ADDRESS_DATA", message: "Customer required for addressId." };
    }
    const [addrRow] = await db
      .select({
        latitude: customerAddresses.latitude,
        longitude: customerAddresses.longitude,
        city: customerAddresses.city,
        state: customerAddresses.state,
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
    dropPostalCode = normalizePincode(sanitizePlaceholder(addrRow.postalCode));
    dropStateName = sanitizePlaceholder(addrRow.state);
    if (!cityName && addrRow.city) cityName = normalizeCity(sanitizePlaceholder(addrRow.city) ?? "");
  } else if (input.dropLat != null && input.dropLon != null) {
    dropLat = input.dropLat;
    dropLon = input.dropLon;
  } else {
    return { ok: false, code: "INVALID_ADDRESS_DATA", message: "addressId or dropLat/dropLon required." };
  }
  const pickupLat =
    resolved.pickupLat != null &&
    resolved.pickupLon != null &&
    Number.isFinite(resolved.pickupLat) &&
    Number.isFinite(resolved.pickupLon) &&
    !(resolved.pickupLat === 0 && resolved.pickupLon === 0)
      ? resolved.pickupLat
      : (input.pickupLat ?? resolved.pickupLat);
  const pickupLon =
    resolved.pickupLat != null &&
    resolved.pickupLon != null &&
    Number.isFinite(resolved.pickupLat) &&
    Number.isFinite(resolved.pickupLon) &&
    !(resolved.pickupLat === 0 && resolved.pickupLon === 0)
      ? resolved.pickupLon
      : (input.pickupLon ?? resolved.pickupLon);
  const env = getEnv();
  const quoteRes = await resolveStoreDeliveryQuote({
    storeId: input.merchantId,
    customerId: input.customerId > 0 ? input.customerId : null,
    addressId: input.addressId ?? null,
    drop: input.addressId == null ? { lat: dropLat, lng: dropLon, pincode: dropPostalCode, city: cityName } : null,
    actor: "customer",
    serviceType: (input.serviceType ?? "FOOD").toUpperCase() as any,
    skipCache: false,
  });
  if (!quoteRes.ok) {
    return { ok: false, code: quoteRes.code, message: quoteRes.message };
  }
  const quote = quoteRes.quote;
  const distanceKm = quote.distance_km;

  const rates = await getStoreBillingRates(resolved.merchantStoreId);
  const packagingChargeAmount = rates?.packagingChargeAmount ?? 0;
  const deliveryChargePerKm = rates?.deliveryChargePerKm ?? 0; // legacy; keep for now
  // Per-item packaging: snapshot → DB per-item → store default per-item (only when packaging applies).
  const packDb = await loadPackagingChargesFromMenuItems({
    merchantStoreId: resolved.merchantStoreId,
    menuItemIds: input.items.map((i) => Number(i.menuItemId)),
  });
  const itemPackagingTotal = computeItemPackagingTotal({
    items: input.items,
    storeDefaultPerUnit: packagingChargeAmount,
    db: { perUnitByMenuItemId: packDb.perUnitById, foundMenuItemIds: packDb.foundIds },
  });

  const serviceType = (input.serviceType ?? "FOOD").trim().toUpperCase();
  const userSegRaw = input.userSegment ?? "ALL";
  let customerCompletedOrderCount: number | null = null;
  if (input.customerId > 0) {
    customerCompletedOrderCount = await countDeliveredOrdersForCustomer(db, input.customerId);
  }
  const userSegment: "NEW" | "EXISTING" | "ALL" =
    userSegRaw === "NEW" || userSegRaw === "EXISTING"
      ? userSegRaw
      : customerCompletedOrderCount != null
        ? userSegmentFromOrderCount(customerCompletedOrderCount)
        : "ALL";

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

  const orderLinesRaw = input.items.map((i) => {
    const lineAddon = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity * i.quantity, 0);
    const baseLineTotal = i.basePrice * i.quantity;
    const lineTotal = baseLineTotal + lineAddon;
    const rawQ = Number(i.quantity);
    const quantity =
      Number.isFinite(rawQ) && rawQ > 0 ? Math.max(1, Math.floor(rawQ)) : 1;
    const canonical = parseCanonicalPricing(
      i.itemSnapshot && typeof i.itemSnapshot === "object"
        ? (i.itemSnapshot as Record<string, unknown>).canonical_pricing
        : null
    );
    const boostBaked = isStoreFundedItemOfferType(canonical?.merchantOfferType);
    return {
      menuItemId: String(i.menuItemId),
      lineTotal,
      quantity,
      baseLineTotal,
      addonLineTotal: lineAddon,
      boostAlreadyInPrice: boostBaked,
      canonicalPricing: canonical ? (i.itemSnapshot as Record<string, unknown>).canonical_pricing as Record<string, unknown> : null,
      appliedOfferId: boostBaked ? canonical?.merchantOfferId : undefined,
      appliedOfferLabel: boostBaked ? canonical?.merchantOfferName : undefined,
      appliedOfferType: boostBaked ? (canonical?.merchantOfferRawType ?? "PERCENTAGE") : undefined,
      appliedOfferDiscountPct: boostBaked ? canonical?.boostPercent : undefined,
      appliedOfferDiscountFlat: boostBaked ? canonical?.boostFlat : undefined,
      offerDiscountAmount: boostBaked ? 0 : undefined,
    };
  });

  const calcMenuNumericIds = input.items
    .map((i) => {
      const raw = String(i.menuItemId ?? "");
      const base = raw.includes("::")
        ? raw.split("::")[0]!
        : raw.includes("_")
          ? raw.split("_")[0]!
          : raw;
      const n = Number(base);
      return Number.isFinite(n) && n > 0 ? n : NaN;
    })
    .filter((n) => Number.isFinite(n));

  const mrpIneligibleIds = await loadMrpIneligibleMenuItemIds(
    resolved.merchantStoreId,
    calcMenuNumericIds
  );
  const menuIdAliases = await loadMenuItemIdAliases(
    resolved.merchantStoreId,
    calcMenuNumericIds
  );
  // Offer Engine v2: eligibility is server-only (MRP + item-surface). Client hints ignored.
  const orderLines = markOrderLinesDiscountEligibility(orderLinesRaw, {
    mrpIneligibleIds,
    merchantOffers: dataset.merchantOffers,
    now: new Date(),
    extraAliasesByLineId: menuIdAliases,
  });

  // Master geo resolver (cascade: live → saved → reverse-geocode → state-name fallback).
  const calcGeo = await resolveGeoLocation({
    savedPincode: dropPostalCode,
    savedState: dropStateName,
    savedCity: cityName,
    latitude: dropLat,
    longitude: dropLon,
  });
  const dropGeoRefByLevel = calcGeo.refs;
  const platformOfferGeoBindingEffectiveIds = calcGeo.geoBoundOfferIds;
  const checkoutCouponGeoBindingEffectiveIds = calcGeo.geoBoundCouponIds;

  const audRaw = String(input.checkoutAudience ?? "CUSTOMER").toUpperCase();
  const checkoutAudience: "CUSTOMER" | "MERCHANT" | "RIDER" =
    audRaw === "MERCHANT" || audRaw === "RIDER" ? audRaw : "CUSTOMER";

  const deliveryFallbackRates = await getDeliveryFallbackRates();
  const deliveryMinimumInr =
    deliveryFallbackRates.minFeeInr > 0 ? deliveryFallbackRates.minFeeInr : undefined;
  const deliveryDefaultBaseInr = deliveryFallbackRates.baseInr;
  const deliveryDefaultPerKmInr = deliveryFallbackRates.perKmInr;

  let subscriptionBillingCtx: Awaited<
    ReturnType<
      typeof import("../subscription/customer-subscription.service.js").resolveCustomerSubscriptionBillingContext
    >
  > = null;
  if (input.customerId > 0) {
    const { resolveCustomerSubscriptionBillingContext } = await import(
      "../subscription/customer-subscription.service.js"
    );
    subscriptionBillingCtx = await resolveCustomerSubscriptionBillingContext({
      customerId: input.customerId,
      distanceKm,
      isSelfPickup: input.deliveryType === "self_pickup",
      subscriptionOptIn: input.subscriptionOptIn,
      subscriptionPlanId: input.subscriptionPlanId,
    });
  }

  const ctx: BillContext = {
    itemSubtotal,
    addonSubtotal,
    addonQtyTotal,
    orderLines,
    menuIdAliasesByLineId: menuIdAliases,
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
    dropGeoRefByLevel,
    platformOfferGeoBindingEffectiveIds,
    checkoutCouponGeoBindingEffectiveIds,
    // Canonical delivery fee: always use store-quote output as the single source of truth.
    // Billing should not re-resolve delivery pricing using rate cards / geo rules.
    // Self-pickup: the customer collects from the store, so every delivery cost
    // input is forced to zero (and floors are unset so the engine can't
    // re-introduce a fee via the deliveryMinimumInr fallback).
    deliveryFeeFromRateCard: 0,
    deliveryFeeFromSlabsGeoV2: input.deliveryType === "self_pickup" ? 0 : quote.delivery_fee,
    deliverySlabsGeoV2Quote: input.deliveryType === "self_pickup" ? null : ((quote.slab_quote as any) ?? null),
    deliverySlabsGeoV2AppliedGeo: null,
    deliveryFeeFromGeo: null,
    deliveryMinimumInr: input.deliveryType === "self_pickup" ? 0 : deliveryMinimumInr,
    deliveryDefaultBaseInr: input.deliveryType === "self_pickup" ? 0 : deliveryDefaultBaseInr,
    deliveryDefaultPerKmInr: input.deliveryType === "self_pickup" ? 0 : deliveryDefaultPerKmInr,
    tipAmount,
    donationAmount,
    subscriptionOptIn:
      subscriptionBillingCtx?.effectiveSubscriptionOptIn ?? input.subscriptionOptIn === true,
    customerSubscriptionActive: subscriptionBillingCtx?.hasSubscriptionBenefits ?? false,
    customerSubscriptionFreeDeliveryEligible:
      subscriptionBillingCtx?.subscriptionDeliveryBenefitEligible ?? false,
    subscriptionPlanId:
      subscriptionBillingCtx?.planId ??
      (input.subscriptionPlanId != null && input.subscriptionPlanId > 0
        ? input.subscriptionPlanId
        : undefined),
    isSelfPickup: input.deliveryType === "self_pickup",
    deliveryPricingEngine: quote.pricing_engine,
    checkoutAudience,
    couponRedemptionsByUser: input.couponRedemptionsByUser,
    customerCompletedOrderCount,
    merchantOfferUsagesByUser: undefined,
    parcelWeightKg: input.parcelWeightKg ?? null,
    parcelSpeed: input.parcelSpeed ?? null,
    parcelScope: input.parcelScope ?? null,
    paymentMode: input.paymentMode ?? null,
    completedParcelCount: null as number | null,
    selectedPlatformOfferId: (() => {
      const explicit = input.selectedPlatformOfferId ?? null;
      if (explicit != null) return explicit;
      // Prefer platform-offer codes over billing_discounts when the same code exists in both.
      if (couponCode) {
        const matched = dataset.platformOffers.find(
          (o) =>
            platformOfferCouponCodesMatch(o.couponCode, couponCode) &&
            platformOfferServiceMatches(serviceType, o.serviceType)
        );
        if (matched) return matched.id;
      }
      return null;
    })(),
    selectedMerchantOfferId: input.selectedMerchantOfferId ?? null,
    forceNoAutoOffer: input.forceNoAutoOffer === true,
  };

  if (serviceType === "PARCEL" && input.customerId > 0) {
    ctx.completedParcelCount = await countCompletedParcelsForCustomer(db, input.customerId);
  }

  // Load per-user merchant offer usage counts outside the shared dataset cache.
  // Only needed when at least one active offer has a per-user cap.
  if (input.customerId > 0) {
    const offersWithCap = dataset.merchantOffers.filter((o) => o.maxUsesPerUser != null && o.maxUsesPerUser > 0);
    if (offersWithCap.length > 0) {
      ctx.merchantOfferUsagesByUser = await loadMerchantOfferUsagesByUser(
        db,
        input.customerId,
        offersWithCap.map((o) => o.id)
      );
    }

    const platformWithLimits = dataset.platformOffers.filter(
      (o) =>
        (o.maxUsesPerUser != null && o.maxUsesPerUser > 0) ||
        (o.maxUsesPerDay != null && o.maxUsesPerDay > 0) ||
        (o.maxUsesPerMonth != null && o.maxUsesPerMonth > 0)
    );
    if (platformWithLimits.length > 0) {
      ctx.platformOfferUsagesByUser = await loadPlatformOfferUsageCountsForUser(
        db,
        input.customerId,
        platformWithLimits.map((o) => o.id)
      );
    }
    const platformWithTotal = dataset.platformOffers.filter(
      (o) => o.maxUsesTotal != null && o.maxUsesTotal > 0
    );
    if (platformWithTotal.length > 0) {
      ctx.platformOfferLifetimeUseCounts = await loadPlatformOfferLifetimeUseCounts(
        db,
        platformWithTotal.map((o) => o.id)
      );
    }

    if (dataset.coupon) {
      ctx.couponUsageSnapshot = await loadCheckoutCouponUsageSnapshot(
        db,
        input.customerId,
        dataset.coupon.id,
        ctx.now
      );
    }

    // Auto-apply path: when nothing is pinned, preload fully-eligible auto_apply coupons.
    const autoMode =
      !couponCode &&
      ctx.selectedPlatformOfferId == null &&
      (ctx.selectedMerchantOfferId == null || ctx.selectedMerchantOfferId <= 0) &&
      ctx.forceNoAutoOffer !== true;
    if (autoMode) {
      const listed = await listActiveCustomerCoupons(db, serviceType, {
        geoBoundCouponIds: checkoutCouponGeoBindingEffectiveIds,
      });
      const autoCandidates = listed.filter((c) => {
        const cfg = sanitizeCheckoutCouponConfig(c.couponConfig ?? null);
        return cfg.auto_apply === true;
      });
      if (autoCandidates.length > 0) {
        const usageMap = await loadCheckoutCouponUsageSnapshotsForCustomer(
          db,
          input.customerId,
          autoCandidates.map((c) => c.id),
          ctx.now
        );
        ctx.couponUsageByDiscountId = usageMap;
        const eligibleCart = cartPromoQualifyingSubtotal(
          ctx,
          Math.max(0, ctx.itemSubtotal + ctx.addonSubtotal)
        );
        const autoApplyCoupons: DiscountRow[] = [];
        for (const c of autoCandidates) {
          const asDiscount: DiscountRow = {
            id: c.id,
            code: c.code,
            discountType: c.discountType,
            valueNumeric: c.valueNumeric,
            maxDiscountCap: c.maxDiscountCap,
            usageLimit: c.usageLimit,
            usedCount: c.usedCount,
            validFrom: c.validFrom,
            validUntil: c.validUntil,
            isActive: c.isActive,
            isHidden: c.isHidden,
            serviceType: c.serviceType,
            offerAudience: c.offerAudience,
            perUserUsageLimit: c.perUserUsageLimit,
            metadata: c.metadata,
            couponConfig: c.couponConfig,
          };
          const eligibility = evaluateCheckoutCouponEligibility(
            asDiscount,
            usageMap.get(c.id) ?? { lifetime: 0, day: 0, week: 0, month: 0, year: 0 },
            {
              serviceType,
              userSegment: ctx.userSegment,
              checkoutAudience: ctx.checkoutAudience,
              customerCompletedOrderCount: ctx.customerCompletedOrderCount,
              cartSubtotal: eligibleCart,
              distanceKm: ctx.distanceKm,
              weightKg: ctx.parcelWeightKg,
              vehicleType: ctx.vehicleType ?? ctx.rideType,
              paymentMode: ctx.paymentMode,
              cityName: ctx.cityName,
              now: ctx.now,
            }
          );
          if (eligibility.fullyEligible) autoApplyCoupons.push(asDiscount);
        }
        // Clone dataset so the shared cache stays user-agnostic.
        dataset = { ...dataset, autoApplyCoupons };
      }
    }
  }

  const billing = executeBillingPipeline(ctx, dataset);

  const deliveryFeeBeforeBenefitsInr =
    Math.round(Math.max(0, billing.delivery_fee_gross ?? billing.delivery_fee) * 100) / 100;

  let adjustedBilling = billing;
  const deliveryPricing = {
    pricingEngine: quote.pricing_engine,
    progressiveSlabs: quote._progressiveSlabs ?? null,
    fallbackRates: deliveryFallbackRates,
  };

  if (input.customerId > 0) {
    const { applyCustomerSubscriptionBillingAdjustments } = await import(
      "../subscription/customer-subscription.service.js"
    );
    adjustedBilling = await applyCustomerSubscriptionBillingAdjustments({
      customerId: input.customerId,
      billing,
      distanceKm,
      isSelfPickup: input.deliveryType === "self_pickup",
      subscriptionOptIn: input.subscriptionOptIn,
      subscriptionPlanId: input.subscriptionPlanId,
      subscriptionBillingCycle: input.subscriptionBillingCycle,
      deliveryPricing,
    });
  }

  // Dynamic pricing (night/rain/peak/festival/…): customer portion → bill, company portion recorded.
  const dynFood = await resolveActiveDynamicSurchargesFromRefs({
    refs: calcGeo.refs,
    service: "food",
    base: adjustedBilling.items_net_after_discounts,
    distanceKm,
    now: input.now,
  }).catch(() => null);
  let companyDynamicSubsidy = 0;
  if (dynFood) {
    companyDynamicSubsidy = applyDynamicSurchargesToBilling(adjustedBilling, dynFood).companySubsidy;
  }

  const serviceable = quote.serviceable;
  const serviceRadiusKm = quote.service_radius_km;

  const rawQuotedFee = quote.delivery_fee as unknown;
  const routeDeliveryFeeInr =
    typeof rawQuotedFee === "number" && Number.isFinite(rawQuotedFee)
      ? Math.max(0, rawQuotedFee)
      : typeof rawQuotedFee === "string" && String(rawQuotedFee).trim() !== ""
        ? Math.max(0, parseFloat(String(rawQuotedFee)))
        : 0;

  const subscriptionDeliveryWaivedInr = (() => {
    const marker = adjustedBilling.charges.find(
      (c) => c.meta?.source === "customer_subscription_delivery_waived_marker"
    );
    if (marker && marker.amount > 0.005) {
      return Math.round(marker.amount * 100) / 100;
    }
    const disc = adjustedBilling.discounts.find(
      (d) => d.meta?.source === "customer_subscription_free_delivery"
    );
    return disc && disc.amount > 0.005 ? Math.round(disc.amount * 100) / 100 : 0;
  })();

  const platformDeliveryWaivedInr = (() => {
    let sum = 0;
    for (const d of adjustedBilling.discounts) {
      const kind = String(d.meta?.offerKind ?? "").toUpperCase();
      if (kind === "FREE_DELIVERY" && d.amount > 0.005) sum += d.amount;
      else if (
        typeof d.meta?.platformOfferId === "number" &&
        d.amount > 0.005 &&
        /free\s*delivery|delivery\s*discount/i.test(String(d.label ?? ""))
      ) {
        sum += d.amount;
      }
    }
    return Math.round(sum * 100) / 100;
  })();

  const deliveryFeeWaivedInrTotal = Math.round(
    (subscriptionDeliveryWaivedInr + platformDeliveryWaivedInr) * 100
  ) / 100;

  /** Pipeline-computed delivery before membership waivers — single source for UI + persistence. */
  const deliveryFeeQuotedInr =
    deliveryFeeBeforeBenefitsInr > 0.005 ? deliveryFeeBeforeBenefitsInr : routeDeliveryFeeInr;

  const subscriptionDeliveryBenefitSnapshot = (() => {
    const subDisc = adjustedBilling.discounts.find(
      (d) => d.meta?.source === "customer_subscription_free_delivery"
    );
    if (subDisc && subDisc.amount > 0.005) {
      const membershipFee = Number(subDisc.meta?.membershipDeliveryFeeInr ?? adjustedBilling.delivery_fee);
      const waived = round2(subDisc.amount);
      const partial = subDisc.meta?.partial === true;
      const coveredRadius = Number(subDisc.meta?.maxFreeDeliveryRadiusKm ?? 0);
      const excessKm = Number(subDisc.meta?.excessDistanceKm ?? 0);
      return {
        waivedInr: waived,
        membershipDeliveryFeeInr: round2(membershipFee),
        coveredRadiusKm: coveredRadius,
        excessDistanceKm: excessKm,
        isPartial: partial,
        applied: true,
      };
    }
    return null;
  })();

  const subscriptionDeliveryBenefitEstimate = await (async () => {
    if (subscriptionDeliveryBenefitSnapshot) return null;
    if (input.deliveryType === "self_pickup") return null;
    const fullFeeForEstimate = Math.max(
      deliveryFeeBeforeBenefitsInr,
      routeDeliveryFeeInr,
      deliveryFeeQuotedInr ?? 0
    );
    if (fullFeeForEstimate <= 0.005) return null;
    const {
      resolveSubscriptionPlanDeliveryPreview,
      computeSubscriptionDeliveryBenefitPreview,
    } = await import("../subscription/customer-subscription.service.js");
    const previewPlan =
      subscriptionBillingCtx != null && input.subscriptionOptIn === true
        ? {
            freeDeliveryEnabled: subscriptionBillingCtx.freeDeliveryEnabled,
            maxFreeDeliveryRadiusKm: subscriptionBillingCtx.maxFreeDeliveryRadiusKm,
          }
        : await resolveSubscriptionPlanDeliveryPreview(input.subscriptionPlanId);
    if (!previewPlan?.freeDeliveryEnabled) return null;
    const benefit = computeSubscriptionDeliveryBenefitPreview({
      distanceKm,
      coveredRadiusKm: previewPlan.maxFreeDeliveryRadiusKm,
      freeDeliveryEnabled: previewPlan.freeDeliveryEnabled,
      fullDeliveryFeeInr: fullFeeForEstimate,
      isSelfPickup: input.deliveryType === "self_pickup",
      deliveryPricing,
    });
    if (!benefit || benefit.waivedInr <= 0.005) return null;
    return {
      waivedInr: benefit.waivedInr,
      membershipDeliveryFeeInr: benefit.membershipDeliveryFeeInr,
      coveredRadiusKm: benefit.coveredRadiusKm,
      excessDistanceKm: benefit.excessDistanceKm,
      isPartial: benefit.isPartial,
      applied: false,
    };
  })();

  const snapshot = {
    ...adjustedBilling,
    eligibleSubtotal: adjustedBilling.eligible_subtotal,
    orderLineEligibility: adjustedBilling.order_line_eligibility,
    orderLinePricing: adjustedBilling.order_line_pricing,
    deliveryFeeBeforeBenefitsInr,
    ...(deliveryFeeWaivedInrTotal > 0.005
      ? { deliveryFeeWaivedInr: deliveryFeeWaivedInrTotal }
      : {}),
    merchantStoreId: resolved.merchantStoreId,
    distanceKm,
    durationMin: quote.duration_min,
    routingSource: quote.source,
    routingApproximate: quote.approximate,
    routeCached: quote.cached,
    dropPostalCode,
    deliveryFeeFromGeo: null,
    deliveryPricingEngine: quote.pricing_engine,
    deliverySlabQuote: quote.slab_quote ?? null,
    deliveryFeeExplainSubtext: formatDeliverySlabExplainSubtext({
      pricingEngine: quote.pricing_engine,
      slabQuote: quote.slab_quote ?? null,
      defaultBaseInr: deliveryFallbackRates.baseInr,
      defaultPerKmInr: deliveryFallbackRates.perKmInr,
    }),
    serviceable,
    serviceRadiusKm,
    unserviceableReason: quote.unserviceable_reason ?? (serviceable ? null : "out_of_range"),
    computedAt: (input.now ?? new Date()).toISOString(),
    deliveryType: input.deliveryType ?? "delivery",
    /** Pre-benefit delivery fee from billing pipeline (matches deliveryFeeBeforeBenefitsInr). */
    deliveryFeeQuotedInr,
    ...(subscriptionDeliveryBenefitSnapshot
      ? { subscriptionDeliveryBenefit: subscriptionDeliveryBenefitSnapshot }
      : {}),
    ...(subscriptionDeliveryBenefitEstimate
      ? { subscriptionDeliveryBenefitEstimate }
      : {}),
    ...(dynFood && dynFood.surcharges.length > 0
      ? { dynamic_surcharges: dynFood.surcharges, company_dynamic_subsidy: companyDynamicSubsidy }
      : {}),
  } as Record<string, unknown>;

  return { ok: true, billing: adjustedBilling, snapshot };
}

export type CheckoutOfferCouponRow = {
  code: string;
  discountType: string;
  description: string;
  estimatedSavingsInr: number | null;
  minOrderAmount?: number | null;
  customerSegment?: string | null;
  /** Dashboard coupon_config.auto_apply — server may apply without a tap. */
  autoApply?: boolean;
};

export type CheckoutOfferMerchantRow = {
  id: number;
  title: string;
  summary: string;
  autoApply: boolean;
  requiresCouponCode: string | null;
  minOrderAmount: number | null;
  estimatedSavingsInr: number | null;
  /** item = Boost/BOGO on menu; sheet = Precision/cart presence. */
  displaySurface?: "item" | "sheet" | "both";
  offerType?: string;
  /** boost | precision | bogo — used to block GatiCash unlock on store precision. */
  conditionsMode?: "boost" | "precision" | "bogo" | null;
};

export type CheckoutOfferPlatformRow = {
  id: number;
  name: string | null;
  couponCode: string | null;
  offerKind: string;
  summary: string;
  estimatedSavingsInr: number | null;
};

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

function estimateCouponSavingsInr(
  c: {
    discountType: string;
    valueNumeric: number | null;
    maxDiscountCap: number | null;
  },
  cartSubtotal: number
): number | null {
  const dt = String(c.discountType).toUpperCase();
  const v = num(c.valueNumeric);
  if (dt === "FIXED" && v > 0) return Math.round(v);
  if (dt === "PERCENTAGE" && v > 0 && cartSubtotal > 0) {
    let saving = (cartSubtotal * v) / 100;
    const cap = c.maxDiscountCap != null ? num(c.maxDiscountCap) : 0;
    if (cap > 0) saving = Math.min(saving, cap);
    return Math.round(saving);
  }
  return null;
}

function estimateMerchantOfferSavingsInr(
  m: {
    offerType: string;
    discountValue: number | null;
    discountPercentage: number | null;
    maxDiscountAmount: number | null;
  },
  cartSubtotal: number
): number | null {
  const ot = String(m.offerType).toUpperCase();
  if (ot === "PERCENTAGE" || ot === "CART_PERCENTAGE") {
    if (num(m.discountPercentage) > 0 && cartSubtotal > 0) {
      let saving = (cartSubtotal * num(m.discountPercentage)) / 100;
      const cap = num(m.maxDiscountAmount);
      if (cap > 0) saving = Math.min(saving, cap);
      return Math.round(saving);
    }
  }
  if (ot === "BOGO" || ot === "BUY_X_GET_Y" || ot === "BUY_N_GET_M") {
    // Rough hint — real savings depend on cart lines / qty at apply time.
    return null;
  }
  const fixed = num(m.discountValue);
  if (fixed > 0) return Math.round(fixed);
  return null;
}

function estimatePlatformOfferSavingsInr(o: PlatformOfferRow, cartSubtotal: number): number | null {
  const kind = String(o.offerKind ?? "").toUpperCase();
  if (kind === "FREE_DELIVERY") {
    // Exact delivery fee is bill-time; surface a positive hint so the sheet doesn't look empty.
    const dd = String(o.deliveryDiscountType ?? "").toUpperCase().trim();
    if (dd === "FIXED" && num(o.deliveryDiscountValue) > 0) {
      return Math.round(num(o.deliveryDiscountValue));
    }
    return null;
  }
  const dt = String(o.discountType ?? "").toUpperCase();
  const v = num(o.valueNumeric);
  if (dt === "FIXED" && v > 0) return Math.round(v);
  if (dt === "PERCENTAGE" && v > 0 && cartSubtotal > 0) {
    let saving = (cartSubtotal * v) / 100;
    const cap = num(o.maxDiscountAmount);
    if (cap > 0) saving = Math.min(saving, cap);
    return Math.round(saving);
  }
  return null;
}

function describeCouponRow(c: {
  discountType: string;
  valueNumeric: number | null;
  maxDiscountCap: number | null;
  couponConfig?: Record<string, unknown> | null;
}): string {
  const parts: string[] = [];
  const v = c.valueNumeric ?? 0;
  const cap =
    c.maxDiscountCap != null && c.maxDiscountCap > 0 ? ` up to ₹${c.maxDiscountCap}` : "";
  if (String(c.discountType).toUpperCase() === "PERCENTAGE") {
    parts.push(`${v}% OFF${cap}`);
  } else if (String(c.discountType).toUpperCase() === "FIXED") {
    parts.push(`₹${v} OFF${cap}`);
  } else {
    parts.push("Promo discount");
  }
  const cfg = sanitizeCheckoutCouponConfig(c.couponConfig ?? null);
  if (cfg.min_order_value != null && cfg.min_order_value > 0) {
    parts.push(`Min order ₹${Math.round(cfg.min_order_value)}`);
  }
  if (cfg.customer_segment === "NEW") parts.push("New customers");
  else if (cfg.customer_segment === "EXISTING") parts.push("Existing customers");
  return parts.join(" · ");
}

function describeMerchantOfferRow(m: {
  offerType: string;
  discountValue: number | null;
  discountPercentage: number | null;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  buyQuantity?: number | null;
  getQuantity?: number | null;
}): string {
  const parts: string[] = [];
  if (m.minOrderAmount != null && m.minOrderAmount > 0) parts.push(`Min order ₹${m.minOrderAmount}`);
  const ot = String(m.offerType).toUpperCase();
  if (ot === "BOGO" || ot === "BUY_X_GET_Y" || ot === "BUY_N_GET_M") {
    const buy = m.buyQuantity != null && m.buyQuantity > 0 ? Math.round(m.buyQuantity) : 1;
    const get = m.getQuantity != null && m.getQuantity > 0 ? Math.round(m.getQuantity) : 1;
    parts.push(`Buy ${buy} Get ${get}`);
  } else if (ot === "PERCENTAGE" || ot === "CART_PERCENTAGE") {
    if (m.discountPercentage != null && m.discountPercentage > 0) {
      parts.push(`${m.discountPercentage}% off`);
    }
  } else if (m.discountValue != null && m.discountValue > 0) {
    parts.push(`₹${m.discountValue} off`);
  }
  if (m.maxDiscountAmount != null && m.maxDiscountAmount > 0) parts.push(`max ₹${m.maxDiscountAmount}`);
  return parts.join(" · ") || "Store offer";
}

function formatPlatformOfferLockReason(reason: string, grossCart: number): string {
  // Geo / hard visibility failures must never be masked as "Add ₹X more".
  if (reason.includes("geo=GEO_NOT_BOUND") || reason.includes("geo=NOT_ELIGIBLE")) {
    return "Not available at your delivery location";
  }
  if (reason.includes("segment=")) return "Not available for your account";
  if (reason.includes("conditions=")) return "Not available at your delivery location";

  const minMatch = reason.match(/minCart=(\d+(?:\.\d+)?)/);
  if (minMatch) {
    const min = Number(minMatch[1]);
    if (Number.isFinite(min) && min > 0) {
      const gap = Math.ceil(Math.max(0, min - grossCart));
      if (gap > 0) return `Add ₹${gap} more to unlock this offer`;
      return `Minimum order value ₹${Math.round(min)} required`;
    }
  }
  if (reason.includes("first_ride_only=")) return "Only available on your first Person Ride";
  if (reason.includes("subscription_free_delivery=active")) return "Already included in your membership";
  if (reason.includes("subscription_benefit_requires_membership")) return "Available with GMitra Plus membership";
  return "Not eligible on this order";
}

function describePlatformOfferRow(o: PlatformOfferRow): string {
  const parts: string[] = [];
  const cond = (o.conditions ?? {}) as Record<string, unknown>;
  if (cond.first_ride_only === true || cond.first_ride_only === "true" || cond.first_ride_only === 1) {
    parts.push("First ride only");
  }
  const minOrd = num(o.minOrderAmount) || num(cond.min_order_value);
  if (minOrd > 0) parts.push(`Min order ₹${minOrd}`);
  const dt = String(o.discountType ?? "").toUpperCase();
  if (dt === "PERCENTAGE" && num(o.valueNumeric) > 0) {
    parts.push(`${o.valueNumeric}% off`);
    const cap = num(o.maxDiscountAmount);
    if (cap > 0) parts.push(`up to ₹${cap}`);
  } else if (dt === "FIXED" && num(o.valueNumeric) > 0) {
    parts.push(`₹${o.valueNumeric} off`);
  }
  const dk = String(o.offerKind ?? "DISCOUNT").toUpperCase();
  if (dk !== "DISCOUNT" && dk !== "COUPON") parts.push(dk.replace(/_/g, " "));
  return parts.join(" · ") || "Platform offer";
}

/** Checkout sheet title — fixed amounts always show ₹ (never "Flat 100 off"). */
function platformOfferCheckoutDisplayName(o: {
  name: string | null;
  discountType: string | null;
  valueNumeric: number | null;
  maxDiscountAmount: number | null;
}): string {
  const dt = String(o.discountType ?? "").toUpperCase();
  const v = num(o.valueNumeric);
  if (dt === "FIXED" && v > 0) {
    return `Flat ₹${Math.round(v)} Off`;
  }
  if (dt === "PERCENTAGE" && v > 0) {
    const cap = num(o.maxDiscountAmount);
    if (cap > 0) return `Flat ${Math.round(v)}% Off up to ₹${Math.round(cap)}`;
    return `Flat ${Math.round(v)}% Off`;
  }
  return normalizeFlatAmountOfferTitle(o.name);
}

/** "Flat 100 off" → "Flat ₹100 Off"; leave % titles alone. */
function normalizeFlatAmountOfferTitle(name: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  if (!raw) return "Platform offer";
  if (/%/.test(raw) || /₹/.test(raw)) {
    return raw.replace(/\s+/g, " ");
  }
  const m = raw.match(/^flat\s+(\d+)\s*(?:rs\.?|inr)?\s*off?$/i);
  if (m) return `Flat ₹${m[1]} Off`;
  const m2 = raw.match(/^(\d+)\s*(?:rs\.?|inr)?\s*off$/i);
  if (m2) return `Flat ₹${m2[1]} Off`;
  return raw;
}

/**
 * Promotions to show on checkout: DB coupons, merchant store offers, geo-scoped platform offers.
 * Eligibility mirrors apply-time gates; final discount still comes from POST /billing/calculate.
 */
export async function listCheckoutBillOffers(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: {
    customerId: number;
    merchantId: string;
    addressId: number;
    /** Promo-eligible item+addon subtotal (excludes Boost/BOGO lines). Min-order gates use this. */
    cartSubtotal: number;
    serviceType?: string;
    userSegment?: "NEW" | "EXISTING" | "ALL";
    /** Live location from customer app — overrides saved address fields when present. */
    livePincode?: string | null;
    liveState?: string | null;
    liveCity?: string | null;
    /** @deprecated Ignored — eligibility uses cartSubtotal (items + add-ons) only. */
    qualifyingCartTotal?: number | null;
    /** Cart menu item ids — item-scoped Boost/BOGO eligibility for the offers sheet. */
    menuItemIds?: string[] | null;
  }
): Promise<
  | {
      ok: true;
      coupons: CheckoutOfferCouponRow[];
      merchantOffers: CheckoutOfferMerchantRow[];
      platformOffers: CheckoutOfferPlatformRow[];
      /** Offers filtered out for this cart, each with the rejection reason. */
      platformOffersIneligible: Array<CheckoutOfferPlatformRow & { reason: string }>;
      merchantOffersIneligible: Array<CheckoutOfferMerchantRow & { reason: string; lockReason: string }>;
      /** Offer Engine v2 — promo-eligible subtotal used for min-order gates. */
      eligibleSubtotal: number;
      orderLineEligibility: Array<{
        menuItemId: string;
        lineTotal: number;
        quantity: number;
        isDiscountEligible: boolean;
        ineligibilityReason: "ITEM_PROMO" | "MRP" | null;
      }>;
    }
  | { ok: false; code: string; message: string }
> {
  const resolved = await resolveMerchantStore(input.merchantId);
  if (!resolved.ok) return resolved;

  if (!input.customerId || input.customerId < 1) {
    return { ok: false, code: "INVALID_CUSTOMER", message: "Customer required." };
  }

  const [addrRow] = await db
    .select({
      latitude: customerAddresses.latitude,
      longitude: customerAddresses.longitude,
      city: customerAddresses.city,
      state: customerAddresses.state,
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

  const dropLat = addrRow.latitude != null ? Number(addrRow.latitude) : 0;
  const dropLon = addrRow.longitude != null ? Number(addrRow.longitude) : 0;

  // Geo: live app location → saved address → reverse-geocode coords (same cascade as calculate).
  const geo = await resolveGeoLocation({
    livePincode: input.livePincode,
    liveState: input.liveState,
    liveCity: input.liveCity,
    savedPincode: addrRow.postalCode,
    savedState: addrRow.state,
    savedCity: addrRow.city,
    latitude: dropLat,
    longitude: dropLon,
  });
  const dropPostalCode = geo.pincode;
  const dropStateName = geo.stateName;
  const cityName = geo.city;

  // Self-heal: if reverse-geocode produced new values that the saved row doesn't have,
  // persist them so future requests skip the network call.
  if (geo.reverseGeocoded) {
    const patch: Partial<{ postalCode: string; state: string; city: string }> = {};
    if (geo.reverseGeocoded.pincode && !sanitizePlaceholder(addrRow.postalCode)) {
      patch.postalCode = geo.reverseGeocoded.pincode;
    }
    if (geo.reverseGeocoded.state && !sanitizePlaceholder(addrRow.state)) {
      patch.state = geo.reverseGeocoded.state;
    }
    if (geo.reverseGeocoded.city && !sanitizePlaceholder(addrRow.city)) {
      patch.city = geo.reverseGeocoded.city;
    }
    if (Object.keys(patch).length > 0) {
      await db
        .update(customerAddresses)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(customerAddresses.id, input.addressId))
        .catch(() => {});
    }
  }

  const pickupLat = resolved.pickupLat;
  const pickupLon = resolved.pickupLon;
  const env = getEnv();
  const route = await getRoute(
    canonicalStoreToCustomerRouteArgs(
      { lat: pickupLat, lng: pickupLon },
      { lat: dropLat, lng: dropLon },
      {
        mapboxToken: env.MAPBOX_ACCESS_TOKEN ?? undefined,
        osrmBaseUrl: env.OSRM_BASE_URL ?? undefined,
      }
    )
  );
  const distanceKm = route.distanceKm;

  const serviceType = (input.serviceType ?? "FOOD").trim().toUpperCase();
  const userSegRaw = input.userSegment ?? "ALL";
  let customerCompletedOrderCount: number | null = null;
  if (input.customerId > 0) {
    customerCompletedOrderCount = await countDeliveredOrdersForCustomer(db, input.customerId);
  }
  const userSegment: "NEW" | "EXISTING" | "ALL" =
    userSegRaw === "NEW" || userSegRaw === "EXISTING"
      ? userSegRaw
      : customerCompletedOrderCount != null
        ? userSegmentFromOrderCount(customerCompletedOrderCount)
        : "ALL";

  const dropGeoRefByLevel = geo.refs;
  const platformOfferGeoBindingEffectiveIds = geo.geoBoundOfferIds;
  const checkoutCouponGeoBindingEffectiveIds = geo.geoBoundCouponIds;

  const rates = await getStoreBillingRates(resolved.merchantStoreId);
  const itemPlusAddon = Math.max(0, input.cartSubtotal);

  // Offer Engine v2: rebuild order lines + eligibility server-side for min-order gates.
  const menuIdsRaw = (input.menuItemIds ?? []).map((id) => String(id).trim()).filter(Boolean);
  const numericIds = menuIdsRaw
    .map((id) => Number(id.includes("::") ? id.split("::")[0] : id.includes("_") ? id.split("_")[0] : id))
    .filter((n) => Number.isFinite(n) && n > 0);
  const priceById = new Map<string, number>();
  if (numericIds.length > 0) {
    const sql = getSql();
    const rows = await sql<Array<{ id: number; selling_price: string }>>`
      SELECT id, selling_price::text AS selling_price
      FROM merchant_menu_items
      WHERE store_id = ${resolved.merchantStoreId}
        AND id IN ${sql(numericIds)}
    `;
    for (const r of rows) {
      const p = parseFloat(r.selling_price);
      if (Number.isFinite(p) && p >= 0) priceById.set(String(r.id), p);
    }
  }

  const orderLinesRaw =
    menuIdsRaw.length > 0
      ? menuIdsRaw.map((menuItemId) => {
          const base = menuItemId.includes("::")
            ? menuItemId.split("::")[0]!
            : menuItemId.includes("_")
              ? menuItemId.split("_")[0]!
              : menuItemId;
          const unit = priceById.get(String(base)) ?? priceById.get(menuItemId) ?? 0;
          return { menuItemId: base, quantity: 1, lineTotal: unit };
        })
      : [];

  const mrpIneligibleIds = await loadMrpIneligibleMenuItemIds(
    resolved.merchantStoreId,
    numericIds
  );
  const menuIdAliases = await loadMenuItemIdAliases(resolved.merchantStoreId, numericIds);

  const dataset = await loadBillingDatasetUncached(db, {
    merchantStoreId: resolved.merchantStoreId,
    couponCode: null,
    serviceType,
  });

  const orderLines =
    orderLinesRaw.length > 0
      ? markOrderLinesDiscountEligibility(orderLinesRaw, {
          mrpIneligibleIds,
          merchantOffers: dataset.merchantOffers,
          now: new Date(),
          extraAliasesByLineId: menuIdAliases,
        })
      : [];

  const deliveryFallbackRates = await getDeliveryFallbackRates();
  const deliveryDefaultBaseInr = deliveryFallbackRates.baseInr;
  const deliveryDefaultPerKmInr = deliveryFallbackRates.perKmInr;

  let subscriptionBillingCtx: Awaited<
    ReturnType<
      typeof import("../subscription/customer-subscription.service.js").resolveCustomerSubscriptionBillingContext
    >
  > = null;
  if (input.customerId > 0) {
    const { resolveCustomerSubscriptionBillingContext } = await import(
      "../subscription/customer-subscription.service.js"
    );
    subscriptionBillingCtx = await resolveCustomerSubscriptionBillingContext({
      customerId: input.customerId,
      distanceKm,
      isSelfPickup: false,
    });
  }

  const ctx: BillContext = {
    itemSubtotal: itemPlusAddon,
    addonSubtotal: 0,
    addonQtyTotal: 0,
    orderLines: orderLines.map((l) => ({
      menuItemId: l.menuItemId,
      quantity: l.quantity,
      lineTotal: l.lineTotal,
      discountEligible: l.discountEligible,
      ineligibilityReason: l.ineligibilityReason,
    })),
    menuIdAliasesByLineId: menuIdAliases,
    distanceKm,
    merchantStoreId: resolved.merchantStoreId,
    merchantParentId: resolved.parentId,
    now: new Date(),
    userType: "customer",
    userSegment,
    couponCode: null,
    customerCompletedOrderCount,
    lineCategories: [],
    itemPackagingTotal: 0,
    packagingChargeAmount: rates?.packagingChargeAmount ?? 0,
    deliveryChargePerKm: rates?.deliveryChargePerKm ?? 0,
    serviceType,
    cityName,
    dropPostalCode,
    dropGeoRefByLevel,
    platformOfferGeoBindingEffectiveIds,
    checkoutCouponGeoBindingEffectiveIds,
    deliveryFeeFromRateCard: 0,
    deliveryFeeFromGeo: null,
    deliveryDefaultBaseInr,
    deliveryDefaultPerKmInr,
    tipAmount: 0,
    donationAmount: 0,
    subscriptionOptIn: subscriptionBillingCtx?.effectiveSubscriptionOptIn ?? false,
    customerSubscriptionActive: subscriptionBillingCtx?.hasSubscriptionBenefits ?? false,
    customerSubscriptionFreeDeliveryEligible:
      subscriptionBillingCtx?.subscriptionDeliveryBenefitEligible ?? false,
    subscriptionPlanId: subscriptionBillingCtx?.planId,
    checkoutAudience: "CUSTOMER",
  };

  // Scale eligible catalog sum to the client's cart subtotal when prices are available,
  // so min-order matches calculate's eligible share of the real cart.
  const catalogAll = orderLines.reduce((s, l) => s + Math.max(0, l.lineTotal), 0);
  const catalogEligible = eligibleSubtotal(ctx);
  let grossCart = itemPlusAddon;
  if (orderLines.length > 0 && catalogAll > 0.005) {
    grossCart = Math.max(0, (catalogEligible / catalogAll) * itemPlusAddon);
  } else if (orderLines.length > 0) {
    grossCart = cartPromoQualifyingSubtotal(ctx, itemPlusAddon);
  }

  if (input.customerId > 0) {
    const offersWithCap = dataset.merchantOffers.filter(
      (o) => o.maxUsesPerUser != null && o.maxUsesPerUser > 0
    );
    if (offersWithCap.length > 0) {
      ctx.merchantOfferUsagesByUser = await loadMerchantOfferUsagesByUser(
        db,
        input.customerId,
        offersWithCap.map((o) => o.id)
      );
    }

    const platformWithLimits = dataset.platformOffers.filter(
      (o) =>
        (o.maxUsesPerUser != null && o.maxUsesPerUser > 0) ||
        (o.maxUsesPerDay != null && o.maxUsesPerDay > 0) ||
        (o.maxUsesPerMonth != null && o.maxUsesPerMonth > 0)
    );
    if (platformWithLimits.length > 0) {
      ctx.platformOfferUsagesByUser = await loadPlatformOfferUsageCountsForUser(
        db,
        input.customerId,
        platformWithLimits.map((o) => o.id)
      );
    }
    const platformWithTotal = dataset.platformOffers.filter(
      (o) => o.maxUsesTotal != null && o.maxUsesTotal > 0
    );
    if (platformWithTotal.length > 0) {
      ctx.platformOfferLifetimeUseCounts = await loadPlatformOfferLifetimeUseCounts(
        db,
        platformWithTotal.map((o) => o.id)
      );
    }
  }

  const couponRows = await listActiveCustomerCoupons(db, serviceType, {
    geoBoundCouponIds: checkoutCouponGeoBindingEffectiveIds,
  });

  const couponUsageById =
    input.customerId > 0 && couponRows.length > 0
      ? await loadCheckoutCouponUsageSnapshotsForCustomer(
          db,
          input.customerId,
          couponRows.map((c) => c.id),
          ctx.now
        )
      : new Map();

  const coupons: CheckoutOfferCouponRow[] = [];
  for (const c of couponRows) {
    const asDiscount: DiscountRow = {
      id: c.id,
      code: c.code,
      discountType: c.discountType,
      valueNumeric: c.valueNumeric,
      maxDiscountCap: c.maxDiscountCap,
      usageLimit: c.usageLimit,
      usedCount: c.usedCount,
      validFrom: c.validFrom,
      validUntil: c.validUntil,
      isActive: c.isActive,
      isHidden: c.isHidden,
      serviceType: c.serviceType,
      offerAudience: c.offerAudience,
      perUserUsageLimit: c.perUserUsageLimit,
      metadata: c.metadata,
      couponConfig: c.couponConfig,
    };
    const eligibility = evaluateCheckoutCouponEligibility(
      asDiscount,
      couponUsageById.get(c.id) ?? { lifetime: 0, day: 0, week: 0, month: 0, year: 0 },
      {
        serviceType,
        userSegment,
        checkoutAudience: "CUSTOMER",
        customerCompletedOrderCount,
        cartSubtotal: grossCart,
        distanceKm,
        cityName,
        stateName: dropStateName,
        now: ctx.now,
        skipPaymentMode: true,
      }
    );
    // Hide coupons the customer can never use (segment, first-order, usage, …).
    if (!eligibility.hardEligible) continue;
    coupons.push({
      code: c.code,
      discountType: c.discountType,
      description: describeCouponRow(c),
      estimatedSavingsInr: estimateCouponSavingsInr(c, grossCart),
      minOrderAmount:
        eligibility.config.min_order_value != null && eligibility.config.min_order_value > 0
          ? eligibility.config.min_order_value
          : null,
      customerSegment:
        eligibility.config.customer_segment && eligibility.config.customer_segment !== "ALL"
          ? eligibility.config.customer_segment
          : null,
      autoApply: eligibility.config.auto_apply === true,
    });
  }

  // Prefer higher savings first; auto_apply coupons float to the top for featured banner.
  coupons.sort((a, b) => {
    const aa = a.autoApply ? 1 : 0;
    const ba = b.autoApply ? 1 : 0;
    if (ba !== aa) return ba - aa;
    return (b.estimatedSavingsInr ?? 0) - (a.estimatedSavingsInr ?? 0);
  });

  const { eligible: merchantEligible, ineligible: merchantIneligible } =
    listMerchantOffersForCheckout(ctx, dataset, grossCart);

  const merchantOffers: CheckoutOfferMerchantRow[] = merchantEligible.map((m) => {
    const menuItemIds = parseMenuItemIdsFromMeta(m.metadata);
    const conditionsMode = parseConditionsModeFromMeta(m.metadata);
    return {
      id: m.id,
      title: buildCheckoutOfferDisplayTitle({
        type: m.offerType,
        offerTitle: m.title,
        discountPct: m.discountPercentage,
        discountVal: m.discountValue,
        maxDiscount: m.maxDiscountAmount,
        buyQty: m.buyQuantity,
        getQty: m.getQuantity,
        conditionsMode,
      }),
      summary: describeMerchantOfferRow(m),
      autoApply: m.autoApply !== false,
      requiresCouponCode: (m.couponCode ?? "").trim() ? String(m.couponCode).trim() : null,
      minOrderAmount: m.minOrderAmount != null && m.minOrderAmount > 0 ? m.minOrderAmount : null,
      estimatedSavingsInr: estimateMerchantOfferSavingsInr(m, grossCart),
      displaySurface: resolveOfferDisplaySurface({
        offerType: m.offerType,
        offerSubType: m.offerSubType,
        menuItemIds,
        conditionsMode,
      }),
      offerType: m.offerType,
      conditionsMode,
    };
  });

  const merchantOffersIneligible: Array<
    CheckoutOfferMerchantRow & { reason: string; lockReason: string }
  > = merchantIneligible.map((m) => {
    const menuItemIds = parseMenuItemIdsFromMeta(m.metadata);
    const conditionsMode = parseConditionsModeFromMeta(m.metadata);
    return {
      id: m.id,
      title: buildCheckoutOfferDisplayTitle({
        type: m.offerType,
        offerTitle: m.title,
        discountPct: m.discountPercentage,
        discountVal: m.discountValue,
        maxDiscount: m.maxDiscountAmount,
        buyQty: m.buyQuantity,
        getQty: m.getQuantity,
        conditionsMode,
      }),
      summary: describeMerchantOfferRow(m),
      autoApply: m.autoApply !== false,
      requiresCouponCode: (m.couponCode ?? "").trim() ? String(m.couponCode).trim() : null,
      minOrderAmount: m.minOrderAmount != null && m.minOrderAmount > 0 ? m.minOrderAmount : null,
      estimatedSavingsInr: estimateMerchantOfferSavingsInr(m, grossCart),
      displaySurface: resolveOfferDisplaySurface({
        offerType: m.offerType,
        offerSubType: m.offerSubType,
        menuItemIds,
        conditionsMode,
      }),
      offerType: m.offerType,
      conditionsMode,
      reason: m.reason,
      lockReason: m.lockReason,
    };
  });

  const { eligible: platformRows, rejections: platformRejections } =
    listEligiblePlatformOffersForCheckoutWithReasons(ctx, dataset, itemPlusAddon);
  const platformOffers: CheckoutOfferPlatformRow[] = platformRows.map((o) => ({
    id: o.id,
    name: platformOfferCheckoutDisplayName(o),
    couponCode: (o.couponCode ?? "").trim() || null,
    offerKind: String(o.offerKind ?? "DISCOUNT").toUpperCase(),
    summary: describePlatformOfferRow(o),
    estimatedSavingsInr: estimatePlatformOfferSavingsInr(o, grossCart),
  }));

  // Ineligible platform offers — only soft unlocks (min cart / membership / first-ride).
  // Geo-unmapped or location-mismatched offers stay completely hidden.
  const rejectionById = new Map<number, string>();
  for (const r of platformRejections) rejectionById.set(r.id, r.reason);
  const platformOffersIneligible: Array<
    CheckoutOfferPlatformRow & { reason: string; minCartAmount?: number | null }
  > = dataset.platformOffers
      .filter((o) => {
        const tech = rejectionById.get(o.id);
        if (!tech) return false;
        if (isPlatformOfferHardVisibilityRejection(tech)) return false;
        // Defense: never surface an offer that fails location/geo gates.
        if (!platformOfferLocationVisible(ctx, o)) return false;
        return true;
      })
      .map((o) => {
        const tech = rejectionById.get(o.id) ?? "";
        const minMatch = tech.match(/minCart=(\d+(?:\.\d+)?)/);
        const minCartAmount =
          minMatch && Number.isFinite(Number(minMatch[1])) ? Number(minMatch[1]) : null;
        return {
          id: o.id,
          name: platformOfferCheckoutDisplayName(o),
          couponCode: (o.couponCode ?? "").trim() || null,
          offerKind: String(o.offerKind ?? "DISCOUNT").toUpperCase(),
          summary: describePlatformOfferRow(o),
          estimatedSavingsInr: estimatePlatformOfferSavingsInr(o, grossCart),
          reason: formatPlatformOfferLockReason(tech, grossCart),
          minCartAmount,
        };
      });

  // Diagnostic logging — helps debug "no offers showing" issues by showing each filter step.
  // Logs are tagged so they're easy to grep: `grep checkout-offers` in server output.
  // eslint-disable-next-line no-console
  console.log("[checkout-offers]", JSON.stringify({
    customerId: input.customerId,
    merchantStoreId: resolved.merchantStoreId,
    addressId: input.addressId,
    serviceType,
    userSegment,
    cartSubtotal: grossCart,
    sources: {
      live: { pincode: input.livePincode ?? null, state: input.liveState ?? null, city: input.liveCity ?? null },
      saved: { pincode: addrRow.postalCode, state: addrRow.state, city: addrRow.city },
      coords: { lat: dropLat, lon: dropLon },
      reverseGeocoded: geo.reverseGeocoded,
      used: geo.source,
    },
    address: { pincode: dropPostalCode, state: dropStateName, city: cityName },
    geoResolved: {
      pincode_uuid: dropGeoRefByLevel?.pincode ?? null,
      state_uuid: dropGeoRefByLevel?.state ?? null,
      district_uuid: dropGeoRefByLevel?.district ?? null,
      region_uuid: dropGeoRefByLevel?.region ?? null,
    },
    geoBoundOfferIds: Array.from(platformOfferGeoBindingEffectiveIds),
    counts: {
      couponsLoaded: couponRows.length,
      merchantOffersLoaded: dataset.merchantOffers.length,
      platformOffersLoaded: dataset.platformOffers.length,
      platformOffersEligible: platformRows.length,
    },
    platformRejections,
  }));

  return {
    ok: true,
    coupons,
    merchantOffers,
    merchantOffersIneligible,
    platformOffers,
    platformOffersIneligible,
    eligibleSubtotal: Math.round(grossCart * 100) / 100,
    orderLineEligibility: orderLines.map((l) => ({
      menuItemId: l.menuItemId,
      lineTotal: l.lineTotal,
      quantity: l.quantity,
      isDiscountEligible: l.discountEligible !== false,
      ineligibilityReason: l.ineligibilityReason ?? null,
    })),
  };
}

/**
 * Same as listEligiblePlatformOffersForCheckout but returns rejection reasons per offer.
 * Used for diagnostic logging so production can see WHY offers are being filtered out.
 */
function listEligiblePlatformOffersForCheckoutWithReasons(
  ctx: BillContext,
  dataset: { platformOffers: PlatformOfferRow[] },
  itemPlusAddon: number
): { eligible: PlatformOfferRow[]; rejections: Array<{ id: number; name: string | null; reason: string }> } {
  const eligible = listEligiblePlatformOffersForCheckout(ctx, dataset as any, itemPlusAddon);
  const eligibleSet = new Set(eligible.map((o) => o.id));
  const rejections: Array<{ id: number; name: string | null; reason: string }> = [];
  const now = new Date();
  for (const o of dataset.platformOffers) {
    if (eligibleSet.has(o.id)) continue;
    const reasons: string[] = [];
    const audience = String(o.offerAudience ?? "CUSTOMER").toUpperCase().trim();
    if (audience !== "CUSTOMER") reasons.push(`audience=${audience}`);
    const st = ctx.serviceType || "FOOD";
    if (!platformOfferServiceMatches(st, o.serviceType)) reasons.push(`serviceType=${o.serviceType}`);
    if (o.startsAt && now < o.startsAt) reasons.push(`starts_at=${o.startsAt.toISOString()}`);
    if (o.endsAt && now > o.endsAt) reasons.push(`ends_at=${o.endsAt.toISOString()}`);
    const cohort = String(o.customerSegment ?? "ALL").toUpperCase();
    if ((cohort === "NEW" && ctx.userSegment !== "NEW") || (cohort === "EXISTING" && ctx.userSegment === "NEW")) {
      reasons.push(`segment=${cohort} vs user=${ctx.userSegment}`);
    }
    const scope = String(o.targetScope ?? "GLOBAL").toUpperCase();
    if (scope === "MERCHANT" || scope === "GEO_MERCHANT") {
      if (o.merchantIds.length === 0 || !o.merchantIds.includes(ctx.merchantStoreId)) {
        reasons.push(`merchantScope=${scope} merchants=[${o.merchantIds.join(",")}] store=${ctx.merchantStoreId}`);
      }
    }
    // Platform offers require an effective geo binding at the delivery address
    // (or legacy GEO row targets). Unmapped GLOBAL is not customer-visible.
    if (!platformOfferGeoMatches(ctx, o)) {
      const bound = ctx.platformOfferGeoBindingEffectiveIds;
      reasons.push(`geo=NOT_ELIGIBLE (scope=${scope}, effectiveIds.size=${bound.size})`);
    }
    if (platformOfferConflictsWithSubscriptionFreeDelivery(ctx, o)) {
      reasons.push("subscription_free_delivery=active");
    }
    const offerKind = String(o.offerKind ?? "DISCOUNT").toUpperCase();
    if (offerKind === "SUBSCRIPTION_BENEFIT" && !customerHasSubscriptionOfferAccess(ctx)) {
      reasons.push("subscription_benefit_requires_membership");
    }
    const minAmt = (() => {
      const direct = Number(o.minOrderAmount ?? 0);
      if (direct > 0) return direct;
      const cond = (o.conditions ?? {}) as Record<string, unknown>;
      const fallback = Number(cond.min_order_value ?? 0);
      return Number.isFinite(fallback) ? fallback : 0;
    })();
    const minBase = platformOfferMinOrderBase(o, ctx, itemPlusAddon);
    if (minAmt > 0 && minBase < minAmt) reasons.push(`minCart=${minAmt} cart=${minBase}`);
    const cond = (o.conditions ?? {}) as Record<string, unknown>;
    if (!platformOfferConditionsPass(cond, ctx)) reasons.push("conditions=failed");
    if (platformOfferRequiresFirstRideOnly(o)) {
      const st = String(ctx.serviceType ?? "").toUpperCase();
      if (st !== "RIDE") {
        reasons.push("first_ride_only=not_ride_service");
      } else if (ctx.completedPersonRideCount == null) {
        reasons.push("first_ride_only=unknown_history");
      } else if (ctx.completedPersonRideCount > 0) {
        reasons.push(`first_ride_only=has_${ctx.completedPersonRideCount}_completed_rides`);
      }
    }
    if (!rideParcelPromoPasses(ctx, o)) {
      reasons.push("ride_parcel_promo=failed");
    }
    rejections.push({ id: o.id, name: o.name ?? null, reason: reasons.length > 0 ? reasons.join("|") : "unknown" });
  }
  return { eligible, rejections };
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
