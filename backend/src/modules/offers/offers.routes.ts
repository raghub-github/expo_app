/**
 * Public offer listing for customers browsing stores.
 * No auth required — used on store detail screen and home banner before checkout.
 *
 * GET /v1/offers/store/:storeId
 *   Returns active merchant offers for the store + platform offers effective
 *   for the customer's location (resolved via pincode → geo hierarchy).
 *
 * GET /v1/offers/featured
 *   Active merchant + geo/platform store offers near the customer (home carousel).
 */

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { eq, and, or, lte, gte, asc, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb, getSql, withSqlRetry, withDbSlot } from "../../db/client.js";
import {
  merchantOffers,
  billingPlatformOffers,
} from "../../db/schema.js";
import { listStores } from "../merchants/merchant.service.js";
import { computeLiveStatus } from "../merchants/merchant.types.js";
import { listActiveCustomerCoupons } from "../billing/billing.repository.js";
import {
  resolveDropGeoRefsFromPincode,
  resolvePlatformOfferGeoBindingEffectiveIds,
} from "../billing/geoRefFromPincode.js";
import { resolveGeoLocation } from "../billing/geoLocationResolver.js";
import { getStoreByStoreId, getStoreByIdForOrder } from "../merchants/merchant.service.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";
import {
  resolveOfferDisplaySurface,
  parseMenuItemIdsFromMeta,
  parseConditionsModeFromMeta,
} from "./offer-display-surface.js";

/** Merchant upload is stored in merchant_offers.offer_image_url (R2 proxy path or https URL). */
function resolveMerchantOfferImageUrl(
  offerImageUrl: string | null | undefined,
  offerMetadata: unknown
): string | null {
  const direct = typeof offerImageUrl === "string" ? offerImageUrl.trim() : "";
  if (direct) return toAbsoluteClientMediaUrl(direct);

  if (offerMetadata && typeof offerMetadata === "object") {
    const meta = offerMetadata as Record<string, unknown>;
    const legacy =
      (typeof meta.image_url === "string" ? meta.image_url.trim() : "") ||
      (typeof meta.offer_image_url === "string" ? meta.offer_image_url.trim() : "");
    if (legacy) return toAbsoluteClientMediaUrl(legacy);
  }
  return null;
}

type MerchantBannerRow = {
  id: number;
  storeId: number;
  offerTitle: string | null;
  offerType: string | null;
  couponCode: string | null;
  discountValue: unknown;
  discountPercentage: unknown;
  maxDiscountAmount: unknown;
  minOrderAmount: unknown;
  firstOrderOnly: boolean | null;
  newUserOnly: boolean | null;
  displayPriority: number | null;
  offerImageUrl: string | null;
  offerMetadata: unknown;
  validTill: Date | null;
};

/** One carousel card per store — prefer the offer that has a custom banner image. */
function pickBestMerchantOfferPerStore(rows: MerchantBannerRow[]): MerchantBannerRow[] {
  const byStore = new Map<number, MerchantBannerRow>();
  for (const row of rows) {
    const storeId = Number(row.storeId);
    const current = byStore.get(storeId);
    const rowHasImage = !!resolveMerchantOfferImageUrl(row.offerImageUrl, row.offerMetadata);
    const currentHasImage = current
      ? !!resolveMerchantOfferImageUrl(current.offerImageUrl, current.offerMetadata)
      : false;
    const rowPriority = Number(row.displayPriority ?? 0);
    const currentPriority = current ? Number(current.displayPriority ?? 0) : -1;

    if (
      !current ||
      (rowHasImage && !currentHasImage) ||
      (rowHasImage === currentHasImage && rowPriority > currentPriority) ||
      (rowHasImage === currentHasImage &&
        rowPriority === currentPriority &&
        Number(row.id) > Number(current.id))
    ) {
      byStore.set(storeId, row);
    }
  }

  return Array.from(byStore.values()).sort((a, b) => {
    const aImg = resolveMerchantOfferImageUrl(a.offerImageUrl, a.offerMetadata) ? 1 : 0;
    const bImg = resolveMerchantOfferImageUrl(b.offerImageUrl, b.offerMetadata) ? 1 : 0;
    if (bImg !== aImg) return bImg - aImg;
    return Number(b.displayPriority ?? 0) - Number(a.displayPriority ?? 0);
  });
}

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : null;
}

function buildOfferLabel(
  type: string,
  discountPct: number | null,
  discountVal: number | null,
  maxDiscount: number | null,
  buyQty?: number | null,
  getQty?: number | null,
): string {
  const t = String(type ?? "").toUpperCase();
  if ((t === "PERCENTAGE" || t === "CART_PERCENTAGE") && discountPct != null && discountPct > 0) {
    return `${Math.round(discountPct)}% OFF`;
  }
  if ((t === "FLAT" || t === "CART_FLAT") && discountVal != null && discountVal > 0) {
    return `₹${Math.round(discountVal)} OFF`;
  }
  if (t === "FREE_DELIVERY") return "Free Delivery";
  if (t === "BOGO" || t === "BUY_X_GET_Y" || t === "BUY_N_GET_M") {
    const buy = buyQty != null && buyQty > 0 ? Math.round(buyQty) : 1;
    const get = getQty != null && getQty > 0 ? Math.round(getQty) : 1;
    return `Buy ${buy} Get ${get}`;
  }
  if (t === "BUNDLE") return "Bundle Deal";
  if (t === "TIERED") return "Spend More Save More";
  if (t === "COUPON") return "Coupon";
  if (t === "FREE_ITEM") return "Free Item";
  if (maxDiscount != null && maxDiscount > 0) return `Up to ₹${Math.round(maxDiscount)} OFF`;
  return "Special Offer";
}

function buildOfferSublabel(minOrder: number | null, maxDiscount: number | null, firstOrderOnly: boolean, newUserOnly: boolean): string {
  const parts: string[] = [];
  if (firstOrderOnly || newUserOnly) parts.push("New users");
  if (minOrder != null && minOrder > 0) parts.push(`on orders above ₹${Math.round(minOrder)}`);
  if (maxDiscount != null && maxDiscount > 0) parts.push(`up to ₹${Math.round(maxDiscount)}`);
  return parts.join(" · ");
}

function buildPlatformLabel(offerKind: string, discountType: string | null, value: number | null, maxDiscount: number | null): string {
  const kind = String(offerKind ?? "DISCOUNT").toUpperCase();
  if (kind === "FREE_DELIVERY") return "Free Delivery";
  if (kind === "BUY_X_GET_Y") return "Buy More Save More";
  if (kind === "CASHBACK" && value != null && value > 0) {
    return discountType === "PERCENTAGE" ? `${Math.round(value)}% Cashback` : `₹${Math.round(value)} Cashback`;
  }
  if (value != null && value > 0) {
    return discountType === "PERCENTAGE"
      ? `${Math.round(value)}% OFF`
      : `₹${Math.round(value)} OFF`;
  }
  if (maxDiscount != null && maxDiscount > 0) return `Up to ₹${Math.round(maxDiscount)} OFF`;
  return "Platform Offer";
}

function buildPlatformBannerTitle(
  name: string | null,
  offerKind: string,
  discountType: string | null,
  value: number | null,
  maxDiscount: number | null,
): string {
  const trimmedName = name?.trim();
  if (trimmedName) return trimmedName;
  return buildPlatformLabel(offerKind, discountType, value, maxDiscount);
}

function buildPlatformBannerSub(
  minOrder: number | null,
  maxDiscount: number | null,
  customerSegment: string | null,
): string {
  const parts: string[] = [];
  const seg = String(customerSegment ?? "ALL").toUpperCase();
  if (seg === "NEW") parts.push("on your first order");
  if (minOrder != null && minOrder > 0) parts.push(`on orders above ₹${Math.round(minOrder)}`);
  if (maxDiscount != null && maxDiscount > 0) parts.push(`save up to ₹${Math.round(maxDiscount)}`);
  return parts.join(" · ") || "Great deals across GatiMitra";
}

async function resolveStoreInternalId(storeId: string): Promise<number | null> {
  const parsed = parseInt(String(storeId).trim(), 10);
  if (!Number.isNaN(parsed) && parsed >= 1) {
    const s = await getStoreByIdForOrder(parsed);
    return s ? parsed : null;
  }
  const s = await getStoreByStoreId(storeId);
  return s ? Number(s.id) : null;
}

async function fetchMerchantOffers(storeInternalId: number) {
  const db = getDb();
  const sqlClient = getSql();
  const now = new Date();
  const rows = await db
    .select({
      id:                  merchantOffers.id,
      offerId:             merchantOffers.offerId,
      offerTitle:          merchantOffers.offerTitle,
      offerType:           merchantOffers.offerType,
      offerSubType:        merchantOffers.offerSubType,
      discountValue:       merchantOffers.discountValue,
      discountPercentage:  merchantOffers.discountPercentage,
      maxDiscountAmount:   merchantOffers.maxDiscountAmount,
      minOrderAmount:      merchantOffers.minOrderAmount,
      buyQuantity:         merchantOffers.buyQuantity,
      getQuantity:         merchantOffers.getQuantity,
      couponCode:          merchantOffers.couponCode,
      firstOrderOnly:      merchantOffers.firstOrderOnly,
      newUserOnly:         merchantOffers.newUserOnly,
      autoApply:           merchantOffers.autoApply,
      displayPriority:     merchantOffers.displayPriority,
      priority:            merchantOffers.priority,
      offerMetadata:       merchantOffers.offerMetadata,
      lifecycleStatus:     merchantOffers.lifecycleStatus,
    })
    .from(merchantOffers)
    .where(
      and(
        eq(merchantOffers.storeId, storeInternalId),
        eq(merchantOffers.isActive, true),
        lte(merchantOffers.validFrom, now),
        gte(merchantOffers.validTill, now),
        // Prefer ACTIVE/SCHEDULED when lifecycle column is populated; allow legacy null/empty.
        sql`COALESCE(${merchantOffers.lifecycleStatus}, 'ACTIVE') IN ('ACTIVE', 'SCHEDULED')`,
      )
    )
    .orderBy(sql`${merchantOffers.displayPriority} DESC NULLS LAST`, asc(merchantOffers.id));

  // Applicability table holds resolved menu PKs — merge so client can match item_id OR pk.
  const offerPks = rows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0);
  const idsByOfferPk = new Map<number, string[]>();
  if (offerPks.length > 0) {
    try {
      const appRows = await sqlClient`
        SELECT
          a.offer_id,
          a.menu_item_id,
          m.item_id
        FROM merchant_offer_applicability a
        LEFT JOIN merchant_menu_items m ON m.id = a.menu_item_id
        WHERE a.offer_id = ANY(${offerPks})
          AND a.menu_item_id IS NOT NULL
      `;
      // See billing.repository.ts:484 for the same double-cast pattern.
      const typedAppRows = appRows as unknown as Array<{
        offer_id: number | string;
        menu_item_id: number | string | null;
        item_id: string | null;
      }>;
      for (const row of typedAppRows) {
        const oid = Number(row.offer_id);
        if (!Number.isFinite(oid)) continue;
        const list = idsByOfferPk.get(oid) ?? [];
        if (row.menu_item_id != null) list.push(String(row.menu_item_id));
        if (row.item_id) list.push(String(row.item_id).trim());
        idsByOfferPk.set(oid, list);
      }
    } catch {
      // Table may be missing on older DBs — metadata-only fallback.
    }
  }

  return rows.map((r) => {
    const discPct  = n(r.discountPercentage);
    const discVal  = n(r.discountValue);
    const maxDisc  = n(r.maxDiscountAmount);
    const minOrder = n(r.minOrderAmount);
    const buyQty   = r.buyQuantity != null ? Number(r.buyQuantity) : null;
    const getQty   = r.getQuantity != null ? Number(r.getQuantity) : null;
    const type     = String(r.offerType ?? "PERCENTAGE");
    const meta =
      r.offerMetadata && typeof r.offerMetadata === "object"
        ? (r.offerMetadata as Record<string, unknown>)
        : {};
    const fromMeta = parseMenuItemIdsFromMeta(meta) ?? [];
    const fromApp = idsByOfferPk.get(Number(r.id)) ?? [];
    const mergedIds = [...new Set([...fromMeta, ...fromApp].map((x) => String(x).trim()).filter(Boolean))];
    const menuItemIds = mergedIds.length > 0 ? mergedIds : null;

    let conditionsMode = parseConditionsModeFromMeta(meta);
    const offerSubType =
      r.offerSubType ??
      (menuItemIds?.length ? "SPECIFIC_ITEM" : "ALL_ORDERS");

    // Respect stored Boost / Precision / create_path. Legacy null: item-scoped → boost, else precision.
    const isPctOrFlat = type === "PERCENTAGE" || type === "FLAT";
    if (isPctOrFlat && conditionsMode == null) {
      const createPath = String(meta.create_path ?? "").toLowerCase();
      if (createPath === "boost" || createPath === "precision") {
        conditionsMode = createPath;
      } else {
        conditionsMode = menuItemIds?.length ? "boost" : "precision";
      }
    }

    const displaySurface = resolveOfferDisplaySurface({
      offerType: type,
      offerSubType,
      menuItemIds,
      conditionsMode,
    });
    return {
      id:           r.id,
      offer_id:     r.offerId ?? null,
      title:        r.offerTitle,
      offer_type:   type,
      offer_sub_type: offerSubType,
      coupon_code:  r.couponCode ?? null,
      auto_apply:   r.autoApply ?? true,
      label:        buildOfferLabel(type, discPct, discVal, maxDisc, buyQty, getQty),
      sub_label:    buildOfferSublabel(minOrder, maxDisc, r.firstOrderOnly ?? false, r.newUserOnly ?? false),
      discount_percentage: discPct,
      discount_value:      discVal,
      max_discount_amount: maxDisc,
      min_order_amount:    minOrder,
      buy_quantity: buyQty,
      get_quantity: getQty,
      menu_item_ids: menuItemIds,
      conditions_mode: conditionsMode,
      display_surface: displaySurface,
    };
  });
}

async function fetchPlatformOffers(
  pincode: string | null,
  serviceType: string,
  stateName?: string | null,
  cityName?: string | null,
  latitude?: number | null,
  longitude?: number | null,
): Promise<Array<{
  id: number; name: string | null; offer_kind: string;
  label: string; sub_label: string; is_geo_bound: boolean;
}>> {
  const db = getDb();
  const st = serviceType.toUpperCase();
  const now = new Date();

  // Master geo resolver: live values → reverse-geocode lat/lng → state-name fallback.
  // Caller passes pincode/state/city as "live" since these are public unauthenticated
  // endpoints (no saved address — caller is the customer app's location store).
  const geo = await resolveGeoLocation({
    livePincode: pincode,
    liveState: stateName,
    liveCity: cityName,
    latitude,
    longitude,
  });
  const geoBoundIds = geo.geoBoundOfferIds;

  // Load all active platform offers matching service type + customer audience
  const rows = await db
    .select({
      id:                 billingPlatformOffers.id,
      name:               billingPlatformOffers.name,
      serviceType:        billingPlatformOffers.serviceType,
      offerKind:          billingPlatformOffers.offerKind,
      discountType:       billingPlatformOffers.discountType,
      valueNumeric:       billingPlatformOffers.valueNumeric,
      maxDiscountAmount:  billingPlatformOffers.maxDiscountAmount,
      minOrderAmount:     billingPlatformOffers.minOrderAmount,
      targetScope:        billingPlatformOffers.targetScope,
      offerAudience:      billingPlatformOffers.offerAudience,
      customerSegment:    billingPlatformOffers.customerSegment,
      startsAt:           billingPlatformOffers.startsAt,
      endsAt:             billingPlatformOffers.endsAt,
      priority:           billingPlatformOffers.priority,
    })
    .from(billingPlatformOffers)
    .where(and(eq(billingPlatformOffers.isActive, true), eq(billingPlatformOffers.isHidden, false)))
    .orderBy(asc(billingPlatformOffers.priority));

  const result: Array<{
    id: number; name: string | null; offer_kind: string;
    label: string; sub_label: string; is_geo_bound: boolean;
    discount_type: string | null;
    value: number | null;
    max_discount_amount: number | null;
    min_order_amount: number | null;
  }> = [];

  for (const o of rows) {
    // Service type gate
    const oSt = String(o.serviceType ?? "FOOD").toUpperCase();
    if (oSt !== st && oSt !== "ALL") continue;

    // Customer audience gate
    const audience = String(o.offerAudience ?? "CUSTOMER").toUpperCase();
    if (audience !== "CUSTOMER") continue;

    // Time window gate
    if (o.startsAt && new Date() < o.startsAt) continue;
    if (o.endsAt && new Date() > o.endsAt) continue;

    // Geo gate
    const scope = String(o.targetScope ?? "GLOBAL").toUpperCase();
    let isGeoBound = false;
    if (scope === "GEO" || scope === "GEO_MERCHANT") {
      // Must be in geoBoundIds (effective for this pincode location) OR have legacy geo_targets
      if (!geoBoundIds.has(o.id)) continue;
      isGeoBound = true;
    } else if (scope === "MERCHANT") {
      // Merchant-specific: skip for generic listing (no merchantIds filter applied here)
      continue;
    }
    // GLOBAL scope: always show

    const kind     = String(o.offerKind ?? "DISCOUNT").toUpperCase();
    const value    = n(o.valueNumeric);
    const maxDisc  = n(o.maxDiscountAmount);
    const minOrder = n(o.minOrderAmount);

    result.push({
      id:         o.id,
      name:       o.name ?? null,
      offer_kind: kind,
      label:      buildPlatformLabel(kind, o.discountType, value, maxDisc),
      sub_label:  minOrder != null && minOrder > 0 ? `on orders above ₹${Math.round(minOrder)}` : "",
      is_geo_bound: isGeoBound,
      discount_type: o.discountType ?? null,
      value,
      max_discount_amount: maxDisc,
      min_order_amount: minOrder,
    });
  }

  return result;
}

export type HomeBannerOffer = {
  id: string;
  store_id: string;
  store_name: string | null;
  title: string;
  sub: string;
  kind: "merchant" | "platform";
  source_offer_id: number;
  offer_type?: string | null;
  coupon_code?: string | null;
  min_order_amount?: number | null;
  max_discount_amount?: number | null;
  discount_percentage?: number | null;
  discount_value?: number | null;
  offer_image_url?: string | null;
  /** ISO timestamp — offer expires at this time. */
  valid_till?: string | null;
};

type NearbyStoreRef = {
  internalId: number;
  storeId: string;
  name: string;
};

async function resolveNearbyStores(
  lat: number | null,
  lng: number | null,
  limit: number
): Promise<NearbyStoreRef[]> {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return [];
  }
  const { items } = await listStores({ lat, lng, limit });
  const out: NearbyStoreRef[] = [];
  for (const row of items) {
    const internalId = Number((row as { id?: number }).id);
    const storeId = String((row as { store_id?: string }).store_id ?? "").trim();
    if (!Number.isFinite(internalId) || internalId < 1 || !storeId) continue;
    // Single source of truth: a CLOSED store must never occupy a "Recommended with
    // Deals" slot. Gate with the SAME operational formula the customer app + merchant
    // dashboard use (merchant_stores flags, kept fresh by the schedule tick). Closed
    // stores still appear in "Restaurants Near You" etc. with a "Closed · Opens…" label —
    // that's a different feed; only the recommendation surface excludes them here.
    if (computeLiveStatus(row as Parameters<typeof computeLiveStatus>[0]) !== "OPEN") continue;
    const name =
      String((row as { store_display_name?: string | null }).store_display_name ?? "").trim() ||
      String((row as { store_name?: string }).store_name ?? "").trim() ||
      "Restaurant";
    out.push({ internalId, storeId, name });
  }
  return out;
}

async function fetchMerchantBannerOffers(nearby: NearbyStoreRef[]): Promise<HomeBannerOffer[]> {
  if (nearby.length === 0) return [];
  const meta = new Map(nearby.map((s) => [s.internalId, s]));
  const db = getDb();
  const now = new Date();
  const internalIds = nearby.map((s) => s.internalId);

  const rows = await db
    .select({
      id: merchantOffers.id,
      storeId: merchantOffers.storeId,
      offerTitle: merchantOffers.offerTitle,
      offerType: merchantOffers.offerType,
      couponCode: merchantOffers.couponCode,
      discountValue: merchantOffers.discountValue,
      discountPercentage: merchantOffers.discountPercentage,
      maxDiscountAmount: merchantOffers.maxDiscountAmount,
      minOrderAmount: merchantOffers.minOrderAmount,
      firstOrderOnly: merchantOffers.firstOrderOnly,
      newUserOnly: merchantOffers.newUserOnly,
      displayPriority: merchantOffers.displayPriority,
      offerImageUrl: merchantOffers.offerImageUrl,
      offerMetadata: merchantOffers.offerMetadata,
      validTill: merchantOffers.validTill,
    })
    .from(merchantOffers)
    .where(
      and(
        inArray(merchantOffers.storeId, internalIds),
        eq(merchantOffers.isActive, true),
        lte(merchantOffers.validFrom, now),
        gte(merchantOffers.validTill, now)
      )
    )
    .orderBy(sql`${merchantOffers.displayPriority} DESC NULLS LAST`, asc(merchantOffers.id));

  const pickedRows = pickBestMerchantOfferPerStore(rows as MerchantBannerRow[]);
  const banners: HomeBannerOffer[] = [];
  for (const r of pickedRows) {
    const store = meta.get(Number(r.storeId));
    if (!store) continue;
    const discPct = n(r.discountPercentage);
    const discVal = n(r.discountValue);
    const maxDisc = n(r.maxDiscountAmount);
    const minOrder = n(r.minOrderAmount);
    const type = String(r.offerType ?? "PERCENTAGE");
    banners.push({
      id: `merchant-${r.id}-${store.storeId}`,
      store_id: store.storeId,
      store_name: store.name,
      title: buildOfferLabel(type, discPct, discVal, maxDisc),
      sub:
        buildOfferSublabel(minOrder, maxDisc, r.firstOrderOnly ?? false, r.newUserOnly ?? false) ||
        String(r.offerTitle ?? "").trim() ||
        store.name,
      kind: "merchant",
      source_offer_id: r.id,
      offer_type: type,
      coupon_code: r.couponCode ? String(r.couponCode).trim() || null : null,
      min_order_amount: minOrder,
      max_discount_amount: maxDisc,
      discount_percentage: discPct,
      discount_value: discVal,
      offer_image_url: resolveMerchantOfferImageUrl(r.offerImageUrl, r.offerMetadata),
      valid_till: r.validTill ? new Date(r.validTill).toISOString() : null,
    });
  }
  return banners;
}

async function fetchPlatformBannerOffers(
  pincode: string | null,
  serviceType: string,
  stateName: string | null,
  cityName: string | null,
  latitude: number | null,
  longitude: number | null,
  nearby: NearbyStoreRef[]
): Promise<HomeBannerOffer[]> {
  const db = getDb();
  const st = serviceType.toUpperCase();
  const now = new Date();
  const nearbyInternal = new Set(nearby.map((s) => s.internalId));
  const storeByInternal = new Map(nearby.map((s) => [s.internalId, s]));

  const geo = await resolveGeoLocation({
    livePincode: pincode,
    liveState: stateName,
    liveCity: cityName,
    latitude,
    longitude,
  });
  const geoBoundIds = geo.geoBoundOfferIds;

  const rows = await db
    .select({
      id: billingPlatformOffers.id,
      name: billingPlatformOffers.name,
      serviceType: billingPlatformOffers.serviceType,
      offerKind: billingPlatformOffers.offerKind,
      discountType: billingPlatformOffers.discountType,
      valueNumeric: billingPlatformOffers.valueNumeric,
      maxDiscountAmount: billingPlatformOffers.maxDiscountAmount,
      minOrderAmount: billingPlatformOffers.minOrderAmount,
      targetScope: billingPlatformOffers.targetScope,
      offerAudience: billingPlatformOffers.offerAudience,
      customerSegment: billingPlatformOffers.customerSegment,
      merchantIds: billingPlatformOffers.merchantIds,
      startsAt: billingPlatformOffers.startsAt,
      endsAt: billingPlatformOffers.endsAt,
      priority: billingPlatformOffers.priority,
    })
    .from(billingPlatformOffers)
    .where(and(eq(billingPlatformOffers.isActive, true), eq(billingPlatformOffers.isHidden, false)))
    .orderBy(asc(billingPlatformOffers.priority));

  const banners: HomeBannerOffer[] = [];

  for (const o of rows) {
    const oSt = String(o.serviceType ?? "FOOD").toUpperCase();
    if (oSt !== st && oSt !== "ALL") continue;
    if (String(o.offerAudience ?? "CUSTOMER").toUpperCase() !== "CUSTOMER") continue;
    if (o.startsAt && new Date() < o.startsAt) continue;
    if (o.endsAt && new Date() > o.endsAt) continue;

    const scope = String(o.targetScope ?? "GLOBAL").toUpperCase();
    if (scope === "GEO" || scope === "GEO_MERCHANT") {
      if (!geoBoundIds.has(o.id)) continue;
    } else if (scope === "MERCHANT") {
      // Shown only when tied to a nearby store below.
    } else if (scope === "GLOBAL") {
      const kind = String(o.offerKind ?? "DISCOUNT").toUpperCase();
      const value = n(o.valueNumeric);
      const maxDisc = n(o.maxDiscountAmount);
      const minOrder = n(o.minOrderAmount);
      banners.push({
        id: `platform-global-${o.id}`,
        store_id: "",
        store_name: null,
        title: buildPlatformBannerTitle(o.name, kind, o.discountType, value, maxDisc),
        sub: buildPlatformBannerSub(minOrder, maxDisc, o.customerSegment),
        kind: "platform",
        source_offer_id: o.id,
        offer_type: kind,
        coupon_code: null,
        min_order_amount: minOrder,
        max_discount_amount: maxDisc,
        discount_percentage: o.discountType === "PERCENTAGE" ? value : null,
        discount_value: o.discountType !== "PERCENTAGE" ? value : null,
        valid_till: o.endsAt ? new Date(o.endsAt).toISOString() : null,
      });
      continue;
    } else {
      continue;
    }

    const rawIds = Array.isArray(o.merchantIds) ? o.merchantIds : [];
    const merchantInternalIds = rawIds
      .map((x) => (typeof x === "number" ? x : parseInt(String(x), 10)))
      .filter((id) => Number.isFinite(id) && id > 0);

    let store: NearbyStoreRef | null = null;
    if (scope === "MERCHANT" || scope === "GEO_MERCHANT") {
      const matchId = merchantInternalIds.find((id) => nearbyInternal.has(id));
      if (matchId == null) continue;
      store = storeByInternal.get(matchId) ?? null;
      if (!store) continue;
    }

    const kind = String(o.offerKind ?? "DISCOUNT").toUpperCase();
    const value = n(o.valueNumeric);
    const maxDisc = n(o.maxDiscountAmount);
    const minOrder = n(o.minOrderAmount);
    const bannerSub =
      buildPlatformBannerSub(minOrder, maxDisc, o.customerSegment) ||
      (store && minOrder != null && minOrder > 0
        ? `on orders above ₹${Math.round(minOrder)} · ${store.name}`
        : store?.name ?? "Tap to explore deals");

    banners.push({
      id: store ? `platform-${o.id}-${store.storeId}` : `platform-geo-${o.id}`,
      store_id: store?.storeId ?? "",
      store_name: store?.name ?? null,
      title: buildPlatformBannerTitle(o.name, kind, o.discountType, value, maxDisc),
      sub: bannerSub,
      kind: "platform",
      source_offer_id: o.id,
      offer_type: kind,
      coupon_code: null,
      min_order_amount: minOrder,
      max_discount_amount: maxDisc,
      discount_percentage: o.discountType === "PERCENTAGE" ? value : null,
      discount_value: o.discountType !== "PERCENTAGE" ? value : null,
      valid_till: o.endsAt ? new Date(o.endsAt).toISOString() : null,
    });
  }

  return banners;
}

async function fetchCouponBannerOffers(serviceType: string): Promise<HomeBannerOffer[]> {
  const db = getDb();
  const coupons = await listActiveCustomerCoupons(db, serviceType);
  return coupons.map((coupon, idx) => {
    const value = coupon.valueNumeric;
    const isPct = String(coupon.discountType).toUpperCase() === "PERCENTAGE";
    const title =
      isPct && value != null && value > 0
        ? `Flat ${Math.round(value)}% OFF`
        : value != null && value > 0
          ? `Flat ₹${Math.round(value)} OFF`
          : String(coupon.code);
    const maxCap = coupon.maxDiscountCap;
    return {
      id: `coupon-${String(coupon.code).toLowerCase()}`,
      store_id: "",
      store_name: null,
      title,
      sub:
        maxCap != null && maxCap > 0
          ? `Save up to ₹${Math.round(maxCap)} · Use code ${coupon.code}`
          : `Use code ${coupon.code}`,
      kind: "platform",
      source_offer_id: -(idx + 1),
      offer_type: "COUPON",
      coupon_code: coupon.code,
      min_order_amount: null,
      max_discount_amount: maxCap,
      discount_percentage: isPct ? value : null,
      discount_value: !isPct ? value : null,
      valid_till: null,
    };
  });
}

const RIDE_EXCLUDED_PLATFORM_OFFER_KINDS = new Set([
  "TIERED",
  "BUY_X_GET_Y",
  "BUY_N_GET_M",
  "BOGO",
  "BUNDLE",
  "FREE_DELIVERY",
  "FREE_ITEM",
]);

function isRideFeaturedBannerEligible(banner: HomeBannerOffer): boolean {
  if (banner.kind === "merchant") return false;
  const type = String(banner.offer_type ?? "").toUpperCase();
  if (RIDE_EXCLUDED_PLATFORM_OFFER_KINDS.has(type)) return false;
  const title = banner.title?.trim() ?? "";
  if (/spend more save more|buy more save more|buy 1 get 1|bundle deal|free delivery/i.test(title)) {
    return false;
  }
  if (banner.store_id?.trim()) return false;
  return true;
}

/** RIDE checkout/home: skip nearby-store listing (expensive Supabase RPC) — only global/geo platform + coupons. */
async function fetchRideFeaturedOffersFast(params: {
  pincode: string | null;
  stateName: string | null;
  cityName: string | null;
  latitude: number | null;
  longitude: number | null;
  limit: number;
}): Promise<HomeBannerOffer[]> {
  const db = getDb();
  const now = new Date();

  const geo = await resolveGeoLocation({
    livePincode: params.pincode,
    liveState: params.stateName,
    liveCity: params.cityName,
    latitude: params.latitude,
    longitude: params.longitude,
  });
  const geoBoundIds = geo.geoBoundOfferIds;

  const platformRows = await db
      .select({
        id: billingPlatformOffers.id,
        name: billingPlatformOffers.name,
        serviceType: billingPlatformOffers.serviceType,
        offerKind: billingPlatformOffers.offerKind,
        discountType: billingPlatformOffers.discountType,
        valueNumeric: billingPlatformOffers.valueNumeric,
        maxDiscountAmount: billingPlatformOffers.maxDiscountAmount,
        minOrderAmount: billingPlatformOffers.minOrderAmount,
        targetScope: billingPlatformOffers.targetScope,
        offerAudience: billingPlatformOffers.offerAudience,
        customerSegment: billingPlatformOffers.customerSegment,
        startsAt: billingPlatformOffers.startsAt,
        endsAt: billingPlatformOffers.endsAt,
        priority: billingPlatformOffers.priority,
      })
      .from(billingPlatformOffers)
      .where(
        and(
          eq(billingPlatformOffers.isActive, true),
          eq(billingPlatformOffers.isHidden, false),
          or(eq(billingPlatformOffers.serviceType, "RIDE"), eq(billingPlatformOffers.serviceType, "ALL"))
        )
      )
      .orderBy(asc(billingPlatformOffers.priority));
  const couponBanners = await fetchCouponBannerOffers("RIDE");

  const platformBanners: HomeBannerOffer[] = [];
  for (const o of platformRows) {
    if (String(o.offerAudience ?? "CUSTOMER").toUpperCase() !== "CUSTOMER") continue;
    if (o.startsAt && now < o.startsAt) continue;
    if (o.endsAt && now > o.endsAt) continue;

    const scope = String(o.targetScope ?? "GLOBAL").toUpperCase();
    if (scope === "MERCHANT" || scope === "GEO_MERCHANT") continue;
    if ((scope === "GEO" || scope === "GEO_MERCHANT") && !geoBoundIds.has(o.id)) continue;

    const kind = String(o.offerKind ?? "DISCOUNT").toUpperCase();
    if (RIDE_EXCLUDED_PLATFORM_OFFER_KINDS.has(kind)) continue;

    const value = n(o.valueNumeric);
    const maxDisc = n(o.maxDiscountAmount);
    const minOrder = n(o.minOrderAmount);
    platformBanners.push({
      id: scope === "GEO" ? `platform-geo-${o.id}` : `platform-global-${o.id}`,
      store_id: "",
      store_name: null,
      title: buildPlatformBannerTitle(o.name, kind, o.discountType, value, maxDisc),
      sub: buildPlatformBannerSub(minOrder, maxDisc, o.customerSegment),
      kind: "platform",
      source_offer_id: o.id,
      offer_type: kind,
      coupon_code: null,
      min_order_amount: minOrder,
      max_discount_amount: maxDisc,
      discount_percentage: o.discountType === "PERCENTAGE" ? value : null,
      discount_value: o.discountType !== "PERCENTAGE" ? value : null,
      valid_till: o.endsAt ? new Date(o.endsAt).toISOString() : null,
    });
  }

  const seen = new Set<string>();
  const merged: HomeBannerOffer[] = [];
  const push = (b: HomeBannerOffer) => {
    if (!isRideFeaturedBannerEligible(b)) return;
    const key = `${b.kind}::${b.source_offer_id}::${b.store_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(b);
  };

  const globalPlatform = platformBanners.filter((b) => b.id.startsWith("platform-global-"));
  const scopedPlatform = platformBanners.filter((b) => !b.id.startsWith("platform-global-"));
  for (const b of globalPlatform) push(b);
  for (const b of scopedPlatform) push(b);
  for (const b of couponBanners) push(b);

  return merged.slice(0, params.limit);
}

async function fetchHomeFeaturedOffers(params: {
  pincode: string | null;
  stateName: string | null;
  cityName: string | null;
  latitude: number | null;
  longitude: number | null;
  serviceType: string;
  limit: number;
}): Promise<HomeBannerOffer[]> {
  if (params.serviceType.toUpperCase() === "RIDE") {
    return fetchRideFeaturedOffersFast({
      pincode: params.pincode,
      stateName: params.stateName,
      cityName: params.cityName,
      latitude: params.latitude,
      longitude: params.longitude,
      limit: params.limit,
    });
  }

  const nearby = await resolveNearbyStores(params.latitude, params.longitude, 30);
  const merchantBanners = await fetchMerchantBannerOffers(nearby);
  const platformBanners = await fetchPlatformBannerOffers(
    params.pincode,
    params.serviceType,
    params.stateName,
    params.cityName,
    params.latitude,
    params.longitude,
    nearby
  );
  const couponBanners = await fetchCouponBannerOffers(params.serviceType);

  const seen = new Set<string>();
  const merged: HomeBannerOffer[] = [];
  const push = (b: HomeBannerOffer) => {
    const key = `${b.kind}::${b.source_offer_id}::${b.store_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(b);
  };

  const isRide = params.serviceType.toUpperCase() === "RIDE";
  const rideEligible = (b: HomeBannerOffer) => !isRide || isRideFeaturedBannerEligible(b);

  const globalPlatform = platformBanners.filter((b) => b.id.startsWith("platform-global-"));
  const scopedPlatform = platformBanners.filter((b) => !b.id.startsWith("platform-global-"));

  for (const b of globalPlatform) {
    if (rideEligible(b)) push(b);
  }
  for (const b of scopedPlatform) {
    if (rideEligible(b)) push(b);
  }
  for (const b of couponBanners) {
    if (rideEligible(b)) push(b);
  }
  if (!isRide) {
    for (const b of merchantBanners) push(b);
  }

  return merged.slice(0, params.limit);
}

export async function offersRoutes(app: FastifyInstance) {
  // GET /v1/offers/store/:storeId
  app.get(
    "/store/:storeId",
    {
      schema: {
        description: "Active offers for a store — merchant offers + platform geo/global offers. No auth required.",
        params: z.object({ storeId: z.string().min(1) }),
        querystring: z.object({
          pincode:     z.string().optional(),
          state:       z.string().optional(),
          city:        z.string().optional(),
          lat:         z.coerce.number().optional(),
          lng:         z.coerce.number().optional(),
          serviceType: z.enum(["FOOD", "PARCEL", "RIDE"]).optional().default("FOOD"),
        }),
        response: {
          200: z.object({
            merchant_offers: z.array(z.object({
              id:                  z.number(),
              offer_id:            z.string().nullable(),
              title:               z.string(),
              offer_type:          z.string(),
              offer_sub_type:      z.string().nullable().optional(),
              coupon_code:         z.string().nullable(),
              auto_apply:          z.boolean(),
              label:               z.string(),
              sub_label:           z.string(),
              discount_percentage: z.number().nullable(),
              discount_value:      z.number().nullable(),
              max_discount_amount: z.number().nullable(),
              min_order_amount:    z.number().nullable(),
              buy_quantity:        z.number().nullable().optional(),
              get_quantity:        z.number().nullable().optional(),
              menu_item_ids:       z.array(z.string()).nullable().optional(),
              conditions_mode:     z.enum(["boost", "precision"]).nullable().optional(),
              display_surface:     z.enum(["item", "sheet", "both"]).optional(),
            })),
            platform_offers: z.array(z.object({
              id:           z.number(),
              name:         z.string().nullable(),
              offer_kind:   z.string(),
              label:        z.string(),
              sub_label:    z.string(),
              is_geo_bound: z.boolean(),
              discount_type: z.string().nullable().optional(),
              value: z.number().nullable().optional(),
              max_discount_amount: z.number().nullable().optional(),
              min_order_amount: z.number().nullable().optional(),
            })),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { storeId } = req.params as { storeId: string };
      const q = req.query as { pincode?: string; state?: string; city?: string; lat?: number; lng?: number; serviceType?: string };
      const pincode     = q.pincode?.trim() || null;
      const stateName   = q.state?.trim() || null;
      const cityName    = q.city?.trim() || null;
      const latitude    = q.lat ?? null;
      const longitude   = q.lng ?? null;
      const serviceType = q.serviceType ?? "FOOD";

      const storeInternalId = await resolveStoreInternalId(storeId);
      if (storeInternalId == null) {
        return reply.status(404).send({ error: "Store not found" });
      }

      const [merchant_offers, platform_offers] = [
        await fetchMerchantOffers(storeInternalId),
        await fetchPlatformOffers(pincode, serviceType, stateName, cityName, latitude, longitude),
      ];

      return reply.send({ merchant_offers, platform_offers });
    }
  );

  // GET /v1/offers/featured — home banners: active merchant + geo/platform store offers near customer
  app.get(
    "/featured",
    {
      schema: {
        description:
          "Active merchant and platform offers for the home promo carousel (location-scoped). Each item includes store_id for navigation.",
        querystring: z.object({
          pincode:     z.string().optional(),
          state:       z.string().optional(),
          city:        z.string().optional(),
          lat:         z.coerce.number().optional(),
          lng:         z.coerce.number().optional(),
          serviceType: z.enum(["FOOD", "PARCEL", "RIDE"]).optional().default("FOOD"),
          limit:       z.coerce.number().int().positive().max(12).optional().default(6),
        }),
        response: {
          200: z.object({
            offers: z.array(z.object({
              id:              z.string(),
              store_id:        z.string(),
              store_name:      z.string().nullable(),
              title:           z.string(),
              sub:             z.string(),
              kind:            z.enum(["merchant", "platform"]),
              source_offer_id: z.number(),
              offer_type:            z.string().nullable().optional(),
              coupon_code:           z.string().nullable().optional(),
              min_order_amount:      z.number().nullable().optional(),
              max_discount_amount:   z.number().nullable().optional(),
              discount_percentage:   z.number().nullable().optional(),
              discount_value:        z.number().nullable().optional(),
              offer_image_url:       z.string().nullable().optional(),
              valid_till:            z.string().nullable().optional(),
            })),
          }),
        },
      },
    },
    async (req, reply) => {
      const q = req.query as { pincode?: string; state?: string; city?: string; lat?: number; lng?: number; serviceType?: string; limit?: number };
      const pincode     = q.pincode?.trim() || null;
      const stateName   = q.state?.trim() || null;
      const cityName    = q.city?.trim() || null;
      const latitude    = q.lat ?? null;
      const longitude   = q.lng ?? null;
      const serviceType = q.serviceType ?? "FOOD";
      const limit       = Number(q.limit ?? 6);

      const offers = await withDbSlot(
        () =>
          withSqlRetry(() =>
            fetchHomeFeaturedOffers({
              pincode,
              stateName,
              cityName,
              latitude,
              longitude,
              serviceType,
              limit,
            })
          ),
        req
      );
      return reply.send({ offers });
    }
  );
}
