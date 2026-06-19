import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, isNull } from "drizzle-orm";
import { customerAddresses } from "../../db/schema.js";
import { getEnv } from "../../config/env.js";
import { getStoreBillingRates, getStoreByIdForOrder, getStoreByStoreId } from "../merchants/merchant.service.js";
import type { NormalizedOrderItem } from "../orders/orderNormalizer.js";
import { rewriteCartPricesAuthoritatively } from "./serverAuthoritativePricing.js";
import {
  loadBillingDatasetUncached,
  getRulesetVersion,
  listActiveCustomerCoupons,
  loadMerchantOfferUsagesByUser,
} from "./billing.repository.js";
import { executeBillingPipeline } from "./executeBillingPipeline.js";
import {
  customerHasSubscriptionOfferAccess,
  listEligiblePlatformOffersForCheckout,
  platformOfferConditionsPass,
  platformOfferConflictsWithSubscriptionFreeDelivery,
} from "./platformOffersApply.js";
import { listMerchantOffersForCheckout } from "./merchantOffersCheckout.js";
import {
  resolveDropGeoRefsFromPincode,
  resolvePlatformOfferGeoBindingEffectiveIds,
} from "./geoRefFromPincode.js";
import { getRoute } from "../distance/distance.service.js";
import { computeItemPackagingTotal } from "./packagingFromItems.js";
import { formatDeliverySlabExplainSubtext } from "../delivery-slab-pricing/formatDeliverySlabExplain.js";
import { getDeliveryFallbackRates } from "../delivery/deliveryFallback.config.js";
import {
  billingDatasetCacheKey,
  getCachedBillingDataset,
  setCachedBillingDataset,
} from "./ruleCache.js";
import type { BillContext, BillingResult, PlatformOfferRow } from "./types.js";
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
  const pickupLat = input.pickupLat ?? resolved.pickupLat;
  const pickupLon = input.pickupLon ?? resolved.pickupLon;
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

  const orderLines = input.items.map((i) => {
    const lineAddon = i.addons.reduce((a, ad) => a + ad.addonPrice * ad.quantity * i.quantity, 0);
    const lineTotal = i.basePrice * i.quantity + lineAddon;
    const rawQ = Number(i.quantity);
    const quantity =
      Number.isFinite(rawQ) && rawQ > 0 ? Math.max(1, Math.floor(rawQ)) : 1;
    return {
      menuItemId: String(i.menuItemId),
      lineTotal,
      quantity,
    };
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
    customerSubscriptionFreeDeliveryEligible: subscriptionBillingCtx?.freeDeliveryEligible ?? false,
    subscriptionPlanId:
      subscriptionBillingCtx?.planId ??
      (input.subscriptionPlanId != null && input.subscriptionPlanId > 0
        ? input.subscriptionPlanId
        : undefined),
    isSelfPickup: input.deliveryType === "self_pickup",
    deliveryPricingEngine: quote.pricing_engine,
    checkoutAudience,
    couponRedemptionsByUser: input.couponRedemptionsByUser,
    merchantOfferUsagesByUser: undefined,
    selectedPlatformOfferId: input.selectedPlatformOfferId ?? null,
    selectedMerchantOfferId: input.selectedMerchantOfferId ?? null,
    forceNoAutoOffer: input.forceNoAutoOffer === true,
  };

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
  }

  const billing = executeBillingPipeline(ctx, dataset);

  let adjustedBilling = billing;
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
    });
  }

  const serviceable = quote.serviceable;
  const serviceRadiusKm = quote.service_radius_km;

  const rawQuotedFee = quote.delivery_fee as unknown;
  const deliveryFeeQuotedInr =
    typeof rawQuotedFee === "number" && Number.isFinite(rawQuotedFee)
      ? Math.max(0, rawQuotedFee)
      : typeof rawQuotedFee === "string" && String(rawQuotedFee).trim() !== ""
        ? Math.max(0, parseFloat(String(rawQuotedFee)))
        : 0;

  const snapshot = {
    ...adjustedBilling,
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
    /** Store→drop delivery fee from routing/geo before self-pickup waiver (for UI strikethrough). */
    deliveryFeeQuotedInr,
  } as Record<string, unknown>;

  return { ok: true, billing: adjustedBilling, snapshot };
}

export type CheckoutOfferCouponRow = {
  code: string;
  discountType: string;
  description: string;
  estimatedSavingsInr: number | null;
};

export type CheckoutOfferMerchantRow = {
  id: number;
  title: string;
  summary: string;
  autoApply: boolean;
  requiresCouponCode: string | null;
  minOrderAmount: number | null;
  estimatedSavingsInr: number | null;
};

export type CheckoutOfferPlatformRow = {
  id: number;
  name: string | null;
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
  if (ot === "PERCENTAGE" && num(m.discountPercentage) > 0 && cartSubtotal > 0) {
    let saving = (cartSubtotal * num(m.discountPercentage)) / 100;
    const cap = num(m.maxDiscountAmount);
    if (cap > 0) saving = Math.min(saving, cap);
    return Math.round(saving);
  }
  const fixed = num(m.discountValue);
  if (fixed > 0) return Math.round(fixed);
  return null;
}

function estimatePlatformOfferSavingsInr(o: PlatformOfferRow, cartSubtotal: number): number | null {
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
}): string {
  const v = c.valueNumeric ?? 0;
  const cap =
    c.maxDiscountCap != null && c.maxDiscountCap > 0 ? ` up to ₹${c.maxDiscountCap}` : "";
  if (String(c.discountType).toUpperCase() === "PERCENTAGE") {
    return `${v}% OFF${cap}`;
  }
  if (String(c.discountType).toUpperCase() === "FIXED") {
    return `₹${v} OFF${cap}`;
  }
  return "Promo discount";
}

function describeMerchantOfferRow(m: {
  offerType: string;
  discountValue: number | null;
  discountPercentage: number | null;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
}): string {
  const parts: string[] = [];
  if (m.minOrderAmount != null && m.minOrderAmount > 0) parts.push(`Min order ₹${m.minOrderAmount}`);
  const ot = String(m.offerType).toUpperCase();
  if (ot === "PERCENTAGE" && m.discountPercentage != null && m.discountPercentage > 0) {
    parts.push(`${m.discountPercentage}% off`);
  } else if (m.discountValue != null && m.discountValue > 0) {
    parts.push(`₹${m.discountValue} off`);
  }
  if (m.maxDiscountAmount != null && m.maxDiscountAmount > 0) parts.push(`max ₹${m.maxDiscountAmount}`);
  return parts.join(" · ") || "Store offer";
}

function formatPlatformOfferLockReason(reason: string, grossCart: number): string {
  const minMatch = reason.match(/minCart=(\d+(?:\.\d+)?)/);
  if (minMatch) {
    const min = Number(minMatch[1]);
    if (Number.isFinite(min) && min > 0) {
      const gap = Math.ceil(Math.max(0, min - grossCart));
      if (gap > 0) return `Add ₹${gap} more to unlock this offer`;
      return `Minimum order value ₹${Math.round(min)} required`;
    }
  }
  if (reason.includes("geo=GEO_NOT_BOUND")) return "Not available at your delivery location";
  if (reason.includes("segment=")) return "Not available for your account";
  if (reason.includes("subscription_free_delivery=active")) return "Already included in your membership";
  if (reason.includes("subscription_benefit_requires_membership")) return "Available with GMitra Plus membership";
  if (reason.includes("conditions=")) return "Not available at your delivery location";
  return "Not eligible on this order";
}

function describePlatformOfferRow(o: PlatformOfferRow): string {
  const parts: string[] = [];
  const cond = (o.conditions ?? {}) as Record<string, unknown>;
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
    cartSubtotal: number;
    serviceType?: string;
    userSegment?: "NEW" | "EXISTING" | "ALL";
    /** Live location from customer app — overrides saved address fields when present. */
    livePincode?: string | null;
    liveState?: string | null;
    liveCity?: string | null;
    /** @deprecated Ignored — eligibility uses cartSubtotal (items + add-ons) only. */
    qualifyingCartTotal?: number | null;
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

  // Master geo resolver: tries live values → saved values → reverse-geocode lat/lng → state-name fallback.
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
  const route = await getRoute({
    origin: { lat: pickupLat, lng: pickupLon },
    destination: { lat: dropLat, lng: dropLon },
    profile: "driving",
    mapboxToken: env.MAPBOX_ACCESS_TOKEN ?? undefined,
    osrmBaseUrl: env.OSRM_BASE_URL ?? undefined,
  });
  const distanceKm = route.distanceKm;

  const serviceType = (input.serviceType ?? "FOOD").trim().toUpperCase();
  const userSegRaw = input.userSegment ?? "ALL";
  const userSegment: "NEW" | "EXISTING" | "ALL" =
    userSegRaw === "NEW" || userSegRaw === "EXISTING" ? userSegRaw : "ALL";

  const dropGeoRefByLevel = geo.refs;
  const platformOfferGeoBindingEffectiveIds = geo.geoBoundOfferIds;

  const rates = await getStoreBillingRates(resolved.merchantStoreId);
  const itemPlusAddon = Math.max(0, input.cartSubtotal);
  /** Min-order gates use item + add-on subtotal only — never fees or taxes. */
  const grossCart = itemPlusAddon;

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
    orderLines: [],
    distanceKm,
    merchantStoreId: resolved.merchantStoreId,
    merchantParentId: resolved.parentId,
    now: new Date(),
    userType: "customer",
    userSegment,
    couponCode: null,
    lineCategories: [],
    itemPackagingTotal: 0,
    packagingChargeAmount: rates?.packagingChargeAmount ?? 0,
    deliveryChargePerKm: rates?.deliveryChargePerKm ?? 0,
    serviceType,
    cityName,
    dropPostalCode,
    dropGeoRefByLevel,
    platformOfferGeoBindingEffectiveIds,
    deliveryFeeFromRateCard: 0,
    deliveryFeeFromGeo: null,
    deliveryDefaultBaseInr,
    deliveryDefaultPerKmInr,
    tipAmount: 0,
    donationAmount: 0,
    subscriptionOptIn: subscriptionBillingCtx?.effectiveSubscriptionOptIn ?? false,
    customerSubscriptionActive: subscriptionBillingCtx?.hasSubscriptionBenefits ?? false,
    customerSubscriptionFreeDeliveryEligible: subscriptionBillingCtx?.freeDeliveryEligible ?? false,
    subscriptionPlanId: subscriptionBillingCtx?.planId,
    checkoutAudience: "CUSTOMER",
  };

  const dataset = await loadBillingDatasetUncached(db, {
    merchantStoreId: resolved.merchantStoreId,
    couponCode: null,
    serviceType,
  });

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
  }

  const couponRows = await listActiveCustomerCoupons(db, serviceType);

  const coupons: CheckoutOfferCouponRow[] = couponRows.map((c) => ({
    code: c.code,
    discountType: c.discountType,
    description: describeCouponRow(c),
    estimatedSavingsInr: estimateCouponSavingsInr(c, grossCart),
  }));

  const { eligible: merchantEligible, ineligible: merchantIneligible } =
    listMerchantOffersForCheckout(ctx, dataset, grossCart);

  const merchantOffers: CheckoutOfferMerchantRow[] = merchantEligible.map((m) => ({
    id: m.id,
    title: m.title,
    summary: describeMerchantOfferRow(m),
    autoApply: m.autoApply !== false,
    requiresCouponCode:
      m.offerType.toUpperCase() === "COUPON" && (m.couponCode ?? "").trim()
        ? String(m.couponCode).trim()
        : null,
    minOrderAmount: m.minOrderAmount != null && m.minOrderAmount > 0 ? m.minOrderAmount : null,
    estimatedSavingsInr: estimateMerchantOfferSavingsInr(m, grossCart),
  }));

  const merchantOffersIneligible: Array<
    CheckoutOfferMerchantRow & { reason: string; lockReason: string }
  > = merchantIneligible.map((m) => ({
    id: m.id,
    title: m.title,
    summary: describeMerchantOfferRow(m),
    autoApply: m.autoApply !== false,
    requiresCouponCode:
      m.offerType.toUpperCase() === "COUPON" && (m.couponCode ?? "").trim()
        ? String(m.couponCode).trim()
        : null,
    minOrderAmount: m.minOrderAmount != null && m.minOrderAmount > 0 ? m.minOrderAmount : null,
    estimatedSavingsInr: estimateMerchantOfferSavingsInr(m, grossCart),
    reason: m.reason,
    lockReason: m.lockReason,
  }));

  const { eligible: platformRows, rejections: platformRejections } =
    listEligiblePlatformOffersForCheckoutWithReasons(ctx, dataset, grossCart);
  const platformOffers: CheckoutOfferPlatformRow[] = platformRows.map((o) => ({
    id: o.id,
    name: o.name ?? null,
    offerKind: String(o.offerKind ?? "DISCOUNT").toUpperCase(),
    summary: describePlatformOfferRow(o),
    estimatedSavingsInr: estimatePlatformOfferSavingsInr(o, grossCart),
  }));

  // Ineligible platform offers — surfaced so the customer sees "min cart ₹399"
  // style hints (instead of the offer being hidden entirely).
  const rejectionById = new Map<number, string>();
  for (const r of platformRejections) rejectionById.set(r.id, r.reason);
  const platformOffersIneligible: Array<CheckoutOfferPlatformRow & { reason: string }> =
    dataset.platformOffers
      .filter((o) => rejectionById.has(o.id))
      .map((o) => ({
        id: o.id,
        name: o.name ?? null,
        offerKind: String(o.offerKind ?? "DISCOUNT").toUpperCase(),
        summary: describePlatformOfferRow(o),
        estimatedSavingsInr: estimatePlatformOfferSavingsInr(o, grossCart),
        reason: formatPlatformOfferLockReason(
          rejectionById.get(o.id) ?? "",
          grossCart
        ),
      }));

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
  };
}

/**
 * Same as listEligiblePlatformOffersForCheckout but returns rejection reasons per offer.
 * Used for diagnostic logging so production can see WHY offers are being filtered out.
 */
function listEligiblePlatformOffersForCheckoutWithReasons(
  ctx: BillContext,
  dataset: { platformOffers: PlatformOfferRow[] },
  grossCart: number
): { eligible: PlatformOfferRow[]; rejections: Array<{ id: number; name: string | null; reason: string }> } {
  const eligible = listEligiblePlatformOffersForCheckout(ctx, dataset as any, grossCart);
  const eligibleSet = new Set(eligible.map((o) => o.id));
  const rejections: Array<{ id: number; name: string | null; reason: string }> = [];
  const now = new Date();
  for (const o of dataset.platformOffers) {
    if (eligibleSet.has(o.id)) continue;
    const reasons: string[] = [];
    const audience = String(o.offerAudience ?? "CUSTOMER").toUpperCase().trim();
    if (audience !== "CUSTOMER") reasons.push(`audience=${audience}`);
    const st = ctx.serviceType || "FOOD";
    if (o.serviceType !== st && o.serviceType !== "ALL") reasons.push(`serviceType=${o.serviceType}`);
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
    if (scope === "GEO" || scope === "GEO_MERCHANT") {
      const bound = ctx.platformOfferGeoBindingEffectiveIds;
      if (!bound.has(o.id)) reasons.push(`geo=GEO_NOT_BOUND (effectiveIds.size=${bound.size})`);
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
    if (minAmt > 0 && grossCart < minAmt) reasons.push(`minCart=${minAmt} cart=${grossCart}`);
    const cond = (o.conditions ?? {}) as Record<string, unknown>;
    if (!platformOfferConditionsPass(cond, ctx)) reasons.push("conditions=failed");
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
