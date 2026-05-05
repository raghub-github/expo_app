import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, isNull } from "drizzle-orm";
import { customerAddresses } from "../../db/schema.js";
import { getEnv } from "../../config/env.js";
import { getStoreBillingRates, getStoreByIdForOrder, getStoreByStoreId } from "../merchants/merchant.service.js";
import type { NormalizedOrderItem } from "../orders/orderNormalizer.js";
import { loadBillingDatasetUncached, getRulesetVersion, listActiveCustomerCoupons } from "./billing.repository.js";
import { executeBillingPipeline } from "./executeBillingPipeline.js";
import { listEligiblePlatformOffersForCheckout } from "./platformOffersApply.js";
import {
  resolveDropGeoRefsFromPincode,
  resolvePlatformOfferGeoBindingEffectiveIds,
} from "./geoRefFromPincode.js";
import { computeItemPackagingTotal } from "./packagingFromItems.js";
import {
  billingDatasetCacheKey,
  getCachedBillingDataset,
  setCachedBillingDataset,
} from "./ruleCache.js";
import type { BillContext, BillingResult, PlatformOfferRow } from "./types.js";
import { getSupabase } from "../../lib/supabase.js";
import { resolveStoreDeliveryQuote } from "../distance/storeQuote.service.js";

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
  /** Must match coupon.offer_audience for promo codes (default CUSTOMER). */
  checkoutAudience?: "CUSTOMER" | "MERCHANT" | "RIDER";
  /** Prior redemptions of this coupon by the current actor (per-user cap). Omitted = 0 for quotes. */
  couponRedemptionsByUser?: number;
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
    dropPostalCode = normalizePincode(addrRow.postalCode);
    if (!cityName && addrRow.city) cityName = normalizeCity(addrRow.city);
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
  // #region agent log
  fetch('http://127.0.0.1:7918/ingest/1921e81c-618b-431e-b9b9-698313b67d38',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'584fd7'},body:JSON.stringify({sessionId:'584fd7',runId:'pre-fix',hypothesisId:'H1',location:'backend/src/modules/billing/billing.service.ts:quote',message:'computeBillForOrder using canonical store-quote',data:{distanceKm:quote.distance_km,durationMin:quote.duration_min,serviceable:quote.serviceable,pricingEngine:quote.pricing_engine,deliveryFee:quote.delivery_fee,source:quote.source,cached:quote.cached,approximate:quote.approximate,hasDropPostalCode:!!dropPostalCode,dropPostalCodeLen:dropPostalCode?String(dropPostalCode).length:0},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

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

  const dropGeoRefByLevel = await resolveDropGeoRefsFromPincode(dropPostalCode);
  const platformOfferGeoBindingEffectiveIds =
    await resolvePlatformOfferGeoBindingEffectiveIds(dropGeoRefByLevel);

  const audRaw = String(input.checkoutAudience ?? "CUSTOMER").toUpperCase();
  const checkoutAudience: "CUSTOMER" | "MERCHANT" | "RIDER" =
    audRaw === "MERCHANT" || audRaw === "RIDER" ? audRaw : "CUSTOMER";

  const deliveryMinimumInr =
    env.DELIVERY_MIN_FEE_INR != null && env.DELIVERY_MIN_FEE_INR > 0 ? env.DELIVERY_MIN_FEE_INR : undefined;
  const deliveryDefaultBaseInr = env.DELIVERY_DEFAULT_BASE_INR ?? 25;
  const deliveryDefaultPerKmInr = env.DELIVERY_DEFAULT_PER_KM_INR ?? 5;
  // #region agent log
  fetch('http://127.0.0.1:7918/ingest/1921e81c-618b-431e-b9b9-698313b67d38',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'584fd7'},body:JSON.stringify({sessionId:'584fd7',runId:'pre-fix',hypothesisId:'H4',location:'backend/src/modules/billing/billing.service.ts:ctx',message:'BillContext delivery inputs (canonical quote)',data:{deliveryChargePerKm,deliveryMinimumInr:deliveryMinimumInr??null,deliveryDefaultBaseInr,deliveryDefaultPerKmInr,quoteDeliveryFee:quote.delivery_fee,quotePricingEngine:quote.pricing_engine},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

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
    deliveryFeeFromRateCard: 0,
    deliveryFeeFromSlabsGeoV2: quote.delivery_fee,
    deliverySlabsGeoV2Quote: (quote.slab_quote as any) ?? null,
    deliverySlabsGeoV2AppliedGeo: null,
    deliveryFeeFromGeo: null,
    deliveryMinimumInr,
    deliveryDefaultBaseInr,
    deliveryDefaultPerKmInr,
    tipAmount,
    donationAmount,
    subscriptionOptIn: input.subscriptionOptIn === true,
    checkoutAudience,
    couponRedemptionsByUser: input.couponRedemptionsByUser,
  };

  const billing = executeBillingPipeline(ctx, dataset);

  const serviceable = quote.serviceable;
  const serviceRadiusKm = quote.service_radius_km;

  const snapshot = {
    ...billing,
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
    serviceable,
    serviceRadiusKm,
    unserviceableReason: quote.unserviceable_reason ?? (serviceable ? null : "out_of_range"),
    computedAt: (input.now ?? new Date()).toISOString(),
  } as Record<string, unknown>;

  return { ok: true, billing, snapshot };
}

export type CheckoutOfferCouponRow = {
  code: string;
  discountType: string;
  description: string;
};

export type CheckoutOfferMerchantRow = {
  id: number;
  title: string;
  summary: string;
};

export type CheckoutOfferPlatformRow = {
  id: number;
  name: string | null;
  offerKind: string;
  summary: string;
};

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

function describeCouponRow(c: {
  discountType: string;
  valueNumeric: number | null;
  maxDiscountCap: number | null;
}): string {
  const v = c.valueNumeric ?? 0;
  const cap = c.maxDiscountCap != null && c.maxDiscountCap > 0 ? ` · max ₹${c.maxDiscountCap}` : "";
  if (String(c.discountType).toUpperCase() === "PERCENTAGE") {
    return `${v}% off${cap}`;
  }
  if (String(c.discountType).toUpperCase() === "FIXED") {
    return `₹${v} off${cap}`;
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
  }
): Promise<
  | {
      ok: true;
      coupons: CheckoutOfferCouponRow[];
      merchantOffers: CheckoutOfferMerchantRow[];
      platformOffers: CheckoutOfferPlatformRow[];
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
  const dropPostalCode = addrRow.postalCode ? String(addrRow.postalCode).trim() : null;
  const cityName = addrRow.city ? String(addrRow.city).trim() || null : null;

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

  const dropGeoRefByLevel = await resolveDropGeoRefsFromPincode(dropPostalCode);
  const platformOfferGeoBindingEffectiveIds =
    await resolvePlatformOfferGeoBindingEffectiveIds(dropGeoRefByLevel);

  const rates = await getStoreBillingRates(resolved.merchantStoreId);
  const grossCart = Math.max(0, input.cartSubtotal);

  const deliveryDefaultBaseInr = env.DELIVERY_DEFAULT_BASE_INR ?? 25;
  const deliveryDefaultPerKmInr = env.DELIVERY_DEFAULT_PER_KM_INR ?? 5;

  const ctx: BillContext = {
    itemSubtotal: grossCart,
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
    subscriptionOptIn: false,
    checkoutAudience: "CUSTOMER",
  };

  const [couponRows, dataset] = await Promise.all([
    listActiveCustomerCoupons(db, serviceType),
    loadBillingDatasetUncached(db, {
      merchantStoreId: resolved.merchantStoreId,
      couponCode: null,
      serviceType,
    }),
  ]);

  const coupons: CheckoutOfferCouponRow[] = couponRows.map((c) => ({
    code: c.code,
    discountType: c.discountType,
    description: describeCouponRow(c),
  }));

  const merchantOffers: CheckoutOfferMerchantRow[] = dataset.merchantOffers.map((m) => ({
    id: m.id,
    title: m.title,
    summary: describeMerchantOfferRow(m),
  }));

  const platformRows = listEligiblePlatformOffersForCheckout(ctx, dataset, grossCart);
  const platformOffers: CheckoutOfferPlatformRow[] = platformRows.map((o) => ({
    id: o.id,
    name: o.name ?? null,
    offerKind: String(o.offerKind ?? "DISCOUNT").toUpperCase(),
    summary: describePlatformOfferRow(o),
  }));

  return { ok: true, coupons, merchantOffers, platformOffers };
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
