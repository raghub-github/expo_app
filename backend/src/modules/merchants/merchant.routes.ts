import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  listStores,
  getMenuByStoreId,
  assertStoreHasCustomerVisibleMenu,
  getMenuVersion,
  getMenuDelta,
  getStoreLiveStatus,
  getStoreSurfaceLiveStatus,
  getMenuItemFullConfig,
  getOrderedTogetherPairs,
  getOrderedTogetherRecommendations,
  search,
  listNearbyStoresByRoadDistance,
} from "./merchant.service.js";
import { listUserAppCategories } from "./userAppCategory.service.js";
import { listFoodItemsUnderPrice, listFoodItemsUnderPriceGrouped } from "./foodHomeItemsUnderPrice.service.js";
import type { NearbyStoreRow } from "./merchant.types.js";
import { computeLiveStatus } from "./merchant.types.js";
import {
  computeSurfaceLiveStatus,
  customerOperationalFromStoreRow,
} from "../../lib/store-surface-online.js";
// Single source of truth for the customer status label — the SAME shared engine the
// partner site / merchant dashboard use. The customer app renders `statusMessage`
// verbatim instead of doing its own client-side "opens tomorrow" date math.
import { formatStoreStatusLabel, type LiveSchedulePhase } from "@gatimitra/store-status";
import { getPrimaryOfferHeadlinesForStores } from "./merchant-offer-headline.js";
import { getStoreRatingsForStores, getStorePersonalizedRating } from "./merchant-store-ratings.js";
import { getScheduleTimesForStores } from "./merchant-store-schedule-times.js";
import { getCompletedOrderCountsForStores } from "./merchant-store-order-stats.js";
import {
  averagePrepMinutesFromMenuItemRows,
  getAverageMenuPrepMinutesForStores,
  getPreparationBufferMinutesForStores,
  resolveStorePrepMinutesForEta,
} from "./merchant-menu-prep.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";
import { previewEtaRange } from "../eta/eta.preview.js";
import { getSql } from "../../db/client.js";
import type { MerchantMenuItemRow } from "./merchant.types.js";
import { getSupabase } from "../../lib/supabase.js";
import { auth } from "../../plugins/auth.js";
import { resolveCustomerPkForRequest } from "../../lib/customer-auth.js";

function isBrandOrPlaceholderHeroUrl(url: string | null | undefined): boolean {
  const u = String(url ?? "").trim().toLowerCase();
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

function isFoodHeroMediaUrl(url: string | null | undefined): boolean {
  const abs = toAbsoluteClientMediaUrl(url);
  return Boolean(abs && !isBrandOrPlaceholderHeroUrl(abs));
}

async function getStoreMenuHeroPhotos(storeInternalIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (storeInternalIds.length === 0) return out;
  try {
    const rows = (await getSql()`
      SELECT DISTINCT ON (m.store_id)
        m.store_id,
        COALESCE(
          NULLIF(TRIM(m.item_image_url), ''),
          (
            SELECT img.image_url FROM merchant_menu_item_images img
            WHERE img.menu_item_id = m.id AND img.is_primary = true
            ORDER BY img.id ASC LIMIT 1
          ),
          (
            SELECT img.image_url FROM merchant_menu_item_images img
            WHERE img.menu_item_id = m.id
            ORDER BY img.display_order ASC NULLS LAST, img.id ASC LIMIT 1
          )
        ) AS item_image_url
      FROM merchant_menu_items m
      WHERE m.store_id = ANY(${storeInternalIds}::int[])
        AND (m.is_deleted IS NULL OR m.is_deleted = false)
        AND COALESCE(m.is_active, true) = true
      ORDER BY
        m.store_id,
        (
          COALESCE(
            NULLIF(TRIM(m.item_image_url), ''),
            (SELECT img.image_url FROM merchant_menu_item_images img WHERE img.menu_item_id = m.id LIMIT 1)
          ) IS NOT NULL
        ) DESC,
        m.is_popular DESC NULLS LAST,
        m.is_recommended DESC NULLS LAST,
        m.id ASC
    `) as Array<{ store_id: number; item_image_url: string | null }>;
    for (const r of rows) {
      const url = typeof r.item_image_url === "string" ? r.item_image_url.trim() : "";
      if (!url || isBrandOrPlaceholderHeroUrl(url)) continue;
      const abs = toAbsoluteClientMediaUrl(url);
      if (abs) out.set(Number(r.store_id), abs);
    }
  } catch {
    return out;
  }
  return out;
}

function toFiniteInt(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function toFiniteNumber(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

function mapCustomerMenuItem(
  m: MerchantMenuItemRow & {
    category_name?: string | null;
    customer_strike_price?: string;
    canonical_pricing?: Record<string, unknown>;
  }
) {
  const menuItemId = toFiniteInt(m.id);
  const price = toFiniteNumber(m.selling_price);
  if (menuItemId == null || price == null) return null;

  const categoryId = toFiniteInt(m.category_id);
  const strike = toFiniteNumber(m.customer_strike_price);
  const mrp = toFiniteNumber(m.base_price);
  const basePrice = strike != null && strike > price ? strike : mrp;
  const discountPercentage = toFiniteNumber(m.discount_percentage);
  const prepTimeMinutes = toFiniteInt(m.preparation_time_minutes);

  return {
    id: String(m.item_id ?? ""),
    menuItemId,
    name: String(m.item_name ?? "Item"),
    description: m.item_description ?? undefined,
    price,
    basePrice,
    canonicalPricing: m.canonical_pricing ?? undefined,
    imageUrl: toAbsoluteClientMediaUrl(m.item_image_url ?? null) ?? undefined,
    foodType: m.food_type ?? undefined,
    spiceLevel: m.spice_level ?? undefined,
    isVeg: (m.food_type ?? "").toLowerCase().startsWith("veg"),
    category: m.cuisine_type ?? m.category_name ?? undefined,
    categoryId: categoryId ?? undefined,
    categoryName: m.category_name ?? undefined,
    isPopular: m.is_popular === true ? true : m.is_popular === false ? false : undefined,
    isRecommended:
      m.is_recommended === true ? true : m.is_recommended === false ? false : undefined,
    prepTimeMinutes,
    discountPercentage,
    hasCustomizations: m.has_customizations === true,
    hasAddons: m.has_addons === true,
    hasVariants: m.has_variants === true,
    inStock: m.in_stock !== false,
  };
}

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  /** Distance mode: air = straight-line (internal filter); road = canonical routing engine (listing + checkout). */
  distanceMode: z
    .enum(["air", "road"])
    .optional()
    .default("road"),
  veg: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

const searchQuerySchema = z.object({
  q: z.string().max(200).optional().default(""),
  limit: z.coerce.number().int().min(1).max(50).optional().default(30),
  offset: z.coerce.number().int().min(0).optional().default(0),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  veg: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

const nearbyStoresQuerySchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  maxDistanceKm: z.coerce.number().min(1).max(10).optional().default(10),
  mapboxLimit: z.coerce.number().int().min(1).max(15).optional().default(15),
});

const userAppCategoriesQuerySchema = z.object({
  store_type: z.string().trim().min(1).max(32).optional().default("FOOD"),
});

export async function merchantRoutes(app: FastifyInstance) {
  await app.register(auth, { required: false });

  app.get(
    "/stores/nearby",
    {
      schema: {
        querystring: nearbyStoresQuerySchema,
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              address: z.string(),
              lat: z.number(),
              lng: z.number(),
              distance_km: z.number(),
              duration_min: z.number().nullable(),
              is_open: z.boolean(),
            })
          ),
        },
      },
    },
    async (request, reply) => {
      const q = request.query as z.infer<typeof nearbyStoresQuerySchema>;
      const { items, mapboxFailures } = await listNearbyStoresByRoadDistance({
        lat: q.lat,
        lng: q.lng,
        maxRoadDistanceKm: q.maxDistanceKm,
        mapboxLimit: q.mapboxLimit,
      });
      if (mapboxFailures > 0) {
        request.log.warn(
          { mapboxFailures, lat: q.lat, lng: q.lng },
          "Mapbox distance calls failed for some nearby-store candidates"
        );
      }
      return reply.send(items);
    }
  );

  // GET /v1/merchants – list stores with active menu
  app.get(
    "/merchants",
    {
      schema: {
        querystring: querySchema,
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                displayImage: z.string().nullable(),
                banner_url: z.string().nullable().optional(),
                deliveryTime: z.string().optional(),
                etaMinMinutes: z.number().optional(),
                etaMaxMinutes: z.number().optional(),
                avgPreparationTimeMinutes: z.number().nullable().optional(),
                cuisines: z.array(z.string()).optional(),
                isOpen: z.boolean(),
                liveStatus: z.enum(["OPEN", "CLOSED"]),
                distanceKm: z.number().optional(),
                galleryImages: z.array(z.string()).optional(),
                offerText: z.string().nullable().optional(),
                avgRating: z.number().nullable().optional(),
                totalReviews: z.number().nullable().optional(),
                nextCloseAt: z.union([z.string(), z.number()]).nullable().optional(),
                nextOpenAt: z.union([z.string(), z.number()]).nullable().optional(),
                /** Backend-formatted status label (shared engine) — render verbatim, do NOT recompute. */
                statusMessage: z.string().nullable().optional(),
                statusChip: z.string().nullable().optional(),
                completedOrderCount: z.number().optional(),
                packagingChargeAmount: z.number().nullable().optional(),
                isPureVeg: z.boolean().optional(),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const q = request.query as z.infer<typeof querySchema>;
      const { items } = await listStores({
        limit: q.limit,
        offset: q.offset,
        lat: q.lat,
        lng: q.lng,
        veg_mode: q.veg ?? false,
        distanceMode: q.distanceMode,
      });
      const storeInternalIds = items
        .map((s) => Number((s as { id?: number }).id))
        .filter((id) => Number.isFinite(id) && id > 0);
      const mediaByStoreId = new Map<
        number,
        {
          banner_url: string | null;
          gallery_images: string[] | null;
          packaging_charge_amount: number | null;
          // Tick-written schedule state — the SAME columns the merchant dashboard reads.
          live_schedule_phase: string | null;
          next_open_at: string | null;
          next_close_at: string | null;
          manual_override_active: boolean;
        }
      >();
      if (storeInternalIds.length > 0) {
        try {
          const supabase = getSupabase();
          const { data: mediaRows, error: mediaErr } = await supabase
            .from("merchant_stores")
            .select(
              "id, banner_url, gallery_images, packaging_charge_amount, live_schedule_phase, next_open_at, next_close_at, manual_override_active"
            )
            .in("id", storeInternalIds);
          if (mediaErr) throw mediaErr;
          for (const row of (mediaRows ??
            []) as Array<{
            id: number;
            banner_url?: string | null;
            gallery_images?: string[] | null;
            packaging_charge_amount?: number | string | null;
            live_schedule_phase?: string | null;
            next_open_at?: string | null;
            next_close_at?: string | null;
            manual_override_active?: boolean | null;
          }>) {
            const packagingRaw = row.packaging_charge_amount;
            const packagingNum =
              packagingRaw != null && packagingRaw !== ""
                ? Number(packagingRaw)
                : null;
            mediaByStoreId.set(Number(row.id), {
              banner_url: row.banner_url ?? null,
              gallery_images: Array.isArray(row.gallery_images)
                ? row.gallery_images.filter((g): g is string => typeof g === "string" && g.trim().length > 0)
                : null,
              packaging_charge_amount:
                packagingNum != null && Number.isFinite(packagingNum) ? packagingNum : null,
              live_schedule_phase: row.live_schedule_phase ?? null,
              next_open_at: row.next_open_at ?? null,
              next_close_at: row.next_close_at ?? null,
              manual_override_active: row.manual_override_active === true,
            });
          }
        } catch (err) {
          const e = err as { code?: string; message?: string };
          request.log.warn(
            { code: e?.code, msg: e?.message },
            "merchant-list media enrichment failed; proceeding with RPC media fields"
          );
        }
      }
      // These four lookups enrich the card (offer labels, rating, schedule,
      // order count) but none of them are load-bearing — if any one fails
      // (e.g. pgBouncer statement_timeout under burst load), we still want
      // the list to render. Wrap each so its failure can't 500 the route.
      const settleEnrichment = async <T>(
        label: string,
        p: Promise<T>,
        empty: T,
      ): Promise<T> => {
        try {
          return await p;
        } catch (err) {
          const e = err as { code?: string; message?: string };
          request.log.warn(
            { label, code: e?.code, msg: e?.message },
            "merchant-list enrichment failed; returning empty",
          );
          return empty;
        }
      };
      const [offerHeadlines, ratingSummaries, scheduleTimes, orderCounts, menuPrepAvgs, prepBuffers, menuHeroPhotos] =
        await Promise.all([
        settleEnrichment("offer-headlines", getPrimaryOfferHeadlinesForStores(storeInternalIds), new Map()),
        settleEnrichment("rating-summaries", getStoreRatingsForStores(storeInternalIds), new Map()),
        settleEnrichment("schedule-times", getScheduleTimesForStores(storeInternalIds), new Map()),
        settleEnrichment("order-counts", getCompletedOrderCountsForStores(storeInternalIds), new Map()),
        settleEnrichment(
          "menu-prep-averages",
          getAverageMenuPrepMinutesForStores(storeInternalIds),
          new Map()
        ),
        settleEnrichment(
          "prep-buffers",
          getPreparationBufferMinutesForStores(storeInternalIds),
          new Map()
        ),
        settleEnrichment("menu-hero-photos", getStoreMenuHeroPhotos(storeInternalIds), new Map()),
      ]);

      const body = items.map((s) => {
        const nearby = s as NearbyStoreRow;
        const storeInternalId = Number(s.id);
        const mediaRow =
          Number.isFinite(storeInternalId) && storeInternalId > 0
            ? mediaByStoreId.get(storeInternalId)
            : undefined;
        const mediaGallery = Array.isArray(mediaRow?.gallery_images)
          ? mediaRow?.gallery_images ?? []
          : [];
        const displayImageRaw =
          nearby.display_image ??
          s.banner_url ??
          mediaRow?.banner_url ??
          (Array.isArray(s.gallery_images) && s.gallery_images[0] ? s.gallery_images[0] : null) ??
          (mediaGallery[0] ?? null) ??
          null;
        const bannerAbs = toAbsoluteClientMediaUrl(s.banner_url ?? mediaRow?.banner_url ?? null);
        const galleryRaw = Array.isArray(s.gallery_images) && s.gallery_images.length > 0
          ? s.gallery_images
          : mediaGallery;
        const galleryImages = galleryRaw
          .map((u) => toAbsoluteClientMediaUrl(typeof u === "string" ? u : null))
          .filter((u): u is string => Boolean(u))
          .filter((u) => isFoodHeroMediaUrl(u));
        const menuHero =
          Number.isFinite(storeInternalId) && storeInternalId > 0
            ? menuHeroPhotos.get(storeInternalId) ?? null
            : null;
        const displayImage =
          (isFoodHeroMediaUrl(bannerAbs) ? bannerAbs : null) ??
          galleryImages[0] ??
          (isFoodHeroMediaUrl(displayImageRaw) ? toAbsoluteClientMediaUrl(displayImageRaw) : null) ??
          menuHero;
        const heroBanner = displayImage ?? null;
        const galleryDeduped = galleryImages.filter((u) => u !== heroBanner);
        const storeLevelPrep = nearby.avg_preparation_time_minutes ?? s.avg_preparation_time_minutes;
        const menuAvgPrep =
          Number.isFinite(storeInternalId) && storeInternalId > 0
            ? menuPrepAvgs.get(storeInternalId) ?? null
            : null;
        const prepBuffer =
          Number.isFinite(storeInternalId) && storeInternalId > 0
            ? prepBuffers.get(storeInternalId) ?? 0
            : 0;
        const prepMin = resolveStorePrepMinutesForEta(menuAvgPrep, storeLevelPrep, prepBuffer);
        // ETA range: prep + distance/18kmh + 5..10 min buffer (list preview; not full order engine)
        const etaRange = previewEtaRange({
          distanceKm: "distance_km" in s ? (nearby.distance_km as number) : null,
          prepMinutes: prepMin,
        });
        const sched =
          Number.isFinite(storeInternalId) && storeInternalId > 0
            ? scheduleTimes.get(storeInternalId)
            : undefined;
        const operational = customerOperationalFromStoreRow({
          is_active: s.is_active,
          is_available: (s as { is_available?: boolean | null }).is_available,
          is_accepting_orders: s.is_accepting_orders,
          operational_status: (s as { operational_status?: string | null }).operational_status,
        });
        const liveStatus = computeSurfaceLiveStatus(
          operational,
          sched?.withinOperatingHours ?? false
        );
        const isOpen = liveStatus === "OPEN";
        // Server-format the status label via the shared engine so the customer app
        // renders it verbatim (no client-side schedule/date math). Uses the tick-written
        // merchant_stores columns — identical inputs to the merchant dashboard.
        const schedMeta = mediaRow;
        const nextOpenAuthoritative = schedMeta?.next_open_at ?? sched?.nextOpenAt ?? null;
        const nextCloseAuthoritative = schedMeta?.next_close_at ?? sched?.nextCloseAt ?? null;
        const statusLabel = formatStoreStatusLabel({
          phase: (schedMeta?.live_schedule_phase ?? null) as LiveSchedulePhase | null,
          nextOpenAt: nextOpenAuthoritative,
          nextCloseAt: nextCloseAuthoritative,
          manualOverrideActive: schedMeta?.manual_override_active ?? false,
          isOpenNow: isOpen,
        });
        return {
          id: s.store_id,
          name: s.store_display_name ?? s.store_name,
          displayImage,
          banner_url: heroBanner,
          deliveryTime: `${etaRange.etaMinMinutes}-${etaRange.etaMaxMinutes} min`,
          etaMinMinutes: etaRange.etaMinMinutes,
          etaMaxMinutes: etaRange.etaMaxMinutes,
          avgPreparationTimeMinutes:
            prepMin != null && Number.isFinite(Number(prepMin)) && Number(prepMin) > 0
              ? Math.round(Number(prepMin))
              : null,
          cuisines: s.cuisine_types ?? undefined,
          isOpen,
          liveStatus,
          distanceKm: "distance_km" in s ? nearby.distance_km : undefined,
          galleryImages: galleryDeduped.length > 0 ? galleryDeduped : undefined,
          offerText:
            Number.isFinite(storeInternalId) && storeInternalId > 0
              ? offerHeadlines.get(storeInternalId) ?? null
              : null,
          avgRating:
            Number.isFinite(storeInternalId) && storeInternalId > 0
              ? ratingSummaries.get(storeInternalId)?.avgRating ?? null
              : null,
          totalReviews:
            Number.isFinite(storeInternalId) && storeInternalId > 0
              ? ratingSummaries.get(storeInternalId)?.totalReviews ?? null
              : null,
          nextCloseAt: nextCloseAuthoritative ?? sched?.nextCloseAt ?? null,
          nextOpenAt: nextOpenAuthoritative ?? sched?.nextOpenAt ?? null,
          statusMessage: statusLabel.primary,
          statusChip: statusLabel.chip,
          completedOrderCount:
            Number.isFinite(storeInternalId) && storeInternalId > 0
              ? orderCounts.get(storeInternalId) ?? 0
              : 0,
          packagingChargeAmount:
            Number.isFinite(storeInternalId) && storeInternalId > 0
              ? mediaByStoreId.get(storeInternalId)?.packaging_charge_amount ?? 0
              : 0,
          isPureVeg: s.is_pure_veg === true,
        };
      });
      return reply.send({ items: body });
    }
  );

  // GET /v1/merchants/:id/menu/items/:itemId/full-config – item + variants + customizations + addons for customization sheet.
  app.get<{ Params: { id: string; itemId: string } }>(
    "/merchants/:id/menu/items/:itemId/full-config",
    {
      schema: {
        params: z.object({ id: z.string().min(1), itemId: z.string().min(1) }),
        response: {
          200: z.object({
            item: z.object({
              id: z.string(),
              menuItemId: z.number().optional(),
              name: z.string(),
              description: z.string().nullable(),
              price: z.number(),
              imageUrl: z.string().nullable(),
              isVeg: z.boolean(),
              hasCustomizations: z.boolean(),
              hasAddons: z.boolean(),
              hasVariants: z.boolean(),
            }),
            variants: z.array(z.object({
              id: z.string(),
              name: z.string(),
              type: z.string().nullable(),
              sizeValue: z.string().nullable().optional(),
              sizeUnit: z.string().nullable().optional(),
              price: z.number(),
              isDefault: z.boolean(),
              displayOrder: z.number(),
            })),
            customizations: z.array(z.object({
              id: z.string(),
              title: z.string(),
              type: z.string().nullable(),
              isRequired: z.boolean(),
              minSelection: z.number(),
              maxSelection: z.number(),
              displayOrder: z.number(),
              addons: z.array(z.object({
                id: z.string(),
                name: z.string(),
                price: z.number(),
                imageUrl: z.string().nullable(),
                sizeValue: z.string().nullable().optional(),
                sizeUnit: z.string().nullable().optional(),
                displayOrder: z.number(),
                isMostOrdered: z.boolean().optional(),
              })),
            })),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id: storeId, itemId } = request.params;
      const config = await getMenuItemFullConfig(storeId, itemId);
      if (!config) return reply.status(404).send({ error: "Item not found" });
      return reply.send(config);
    }
  );

  // GET /v1/merchants/:id/menu/ordered-together – co-purchase pairs (optional anchor item).
  app.get<{ Params: { id: string }; Querystring: { anchorMenuItemId?: string; limit?: string } }>(
    "/merchants/:id/menu/ordered-together",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        querystring: z.object({
          anchorMenuItemId: z.string().min(1).optional(),
          limit: z.string().optional(),
        }),
        response: {
          200: z.object({
            pairs: z.array(
              z.object({
                id: z.string(),
                item1Id: z.string(),
                item2Id: z.string(),
                item1MenuItemPk: z.number(),
                item2MenuItemPk: z.number(),
                orderCount: z.number(),
                source: z.enum(["co_purchase", "popular_fallback"]),
              })
            ),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id: storeId } = request.params;
      const { getStoreByStoreId } = await import("./merchant.service.js");
      const store = await getStoreByStoreId(storeId);
      if (!store) return reply.status(404).send({ error: "Store not found" });
      const limitRaw = request.query.limit != null ? Number(request.query.limit) : undefined;
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Number(limitRaw), 1), 24) : undefined;
      const pairs = await getOrderedTogetherPairs(storeId, {
        anchorMenuItemId: request.query.anchorMenuItemId,
        limit,
      });
      return reply.send({ pairs });
    }
  );

  // GET /v1/merchants/:id/menu/ordered-together/recommendations – store pairs + per-item map.
  app.get<{ Params: { id: string }; Querystring: { limit?: string; perAnchorLimit?: string } }>(
    "/merchants/:id/menu/ordered-together/recommendations",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        querystring: z.object({
          limit: z.string().optional(),
          perAnchorLimit: z.string().optional(),
        }),
        response: {
          200: z.object({
            pairs: z.array(
              z.object({
                id: z.string(),
                item1Id: z.string(),
                item2Id: z.string(),
                item1MenuItemPk: z.number(),
                item2MenuItemPk: z.number(),
                orderCount: z.number(),
                source: z.enum(["co_purchase", "popular_fallback"]),
              })
            ),
            // zod v4 requires explicit key + value schemas.
            byAnchorItemId: z.record(
              z.string(),
              z.array(
                z.object({
                  id: z.string(),
                  item1Id: z.string(),
                  item2Id: z.string(),
                  item1MenuItemPk: z.number(),
                  item2MenuItemPk: z.number(),
                  orderCount: z.number(),
                  source: z.enum(["co_purchase", "popular_fallback"]),
                })
              )
            ),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id: storeId } = request.params;
      const { getStoreByStoreId } = await import("./merchant.service.js");
      const store = await getStoreByStoreId(storeId);
      if (!store) return reply.status(404).send({ error: "Store not found" });
      const limit = toFiniteInt(request.query.limit);
      const perAnchorLimit = toFiniteInt(request.query.perAnchorLimit);
      const payload = await getOrderedTogetherRecommendations(storeId, {
        limit: limit != null ? Math.min(Math.max(limit, 1), 24) : undefined,
        perAnchorLimit:
          perAnchorLimit != null ? Math.min(Math.max(perAnchorLimit, 1), 6) : undefined,
      });
      return reply.send(payload);
    }
  );

  // GET /v1/merchants/:id/live-status – single source of truth for OPEN/CLOSED. Used by list, detail, cart, checkout, group order.
  app.get<{ Params: { id: string } }>(
    "/merchants/:id/live-status",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({
            liveStatus: z.enum(["OPEN", "CLOSED"]),
            withinOperatingHours: z.boolean().optional(),
            nextOpenAt: z.string().nullable().optional(),
            nextCloseAt: z.string().nullable().optional(),
            rushActive: z.boolean().optional(),
            rushEndsAt: z.string().nullable().optional(),
            rushRemainingMinutes: z.number().nullable().optional(),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const surface = await getStoreSurfaceLiveStatus(id, request.log);
      if (surface == null) return reply.status(404).send({ error: "Store not found" });
      return reply.send({
        liveStatus: surface.liveStatus,
        withinOperatingHours: surface.withinOperatingHours,
        nextOpenAt: surface.nextOpenAt,
        nextCloseAt: surface.nextCloseAt,
        rushActive: surface.activeRush?.isActive === true,
        rushEndsAt: surface.activeRush?.endsAt ?? null,
        rushRemainingMinutes: surface.activeRush?.remainingMinutes ?? null,
      });
    }
  );

  // GET /v1/merchants/:id/about – store detail for About page (full_address, etc.)
  app.get<{ Params: { id: string }; Querystring: Record<string, unknown> }>(
    "/merchants/:id/about",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({
            store_name: z.string(),
            store_display_name: z.string().nullable(),
            full_address: z.string().nullable(),
            city: z.string().nullable(),
            state: z.string().optional().nullable(),
            postal_code: z.string().nullable(),
            cuisine_types: z.array(z.string()).nullable(),
            operational_status: z.string().nullable(),
            avg_preparation_time_minutes: z.number().nullable(),
            packaging_charge_amount: z.number().nullable().optional(),
            delivery_charge_per_km: z.number().nullable().optional(),
            delivery_radius_km: z.coerce.number().nullable().optional(),
            banner_url: z.string().nullable(),
            is_active: z.boolean().nullable(),
            created_at: z.string().nullable().optional(),
            legal_name: z.string().nullable().optional(),
            gst_number: z.string().nullable().optional(),
            fssai_number: z.string().nullable().optional(),
            store_phone: z.string().nullable().optional(),
            is_cloud_kitchen: z.boolean().optional(),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { getMerchantAboutPayload } = await import("./merchant.service.js");
      const payload = await getMerchantAboutPayload(id);
      if (!payload) return reply.status(404).send({ error: "Store not found" });
      return reply.send(payload);
    }
  );

  const menuQuerystringSchema = z.object({ q: z.string().max(200).optional() });
  const menuDeltaQuerystringSchema = z.object({
    sinceVersion: z.coerce.number().int().nonnegative(),
  });

  // GET /v1/merchants/:id/menu/version – lightweight version check (<200 bytes).
  app.get<{ Params: { id: string } }>(
    "/merchants/:id/menu/version",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({
            menuVersion: z.number(),
            etag: z.string(),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const version = await getMenuVersion(id);
      if (!version) return reply.status(404).send({ error: "Store not found" });
      return reply.send(version);
    }
  );

  // GET /v1/merchants/:id/menu/delta?sinceVersion= – changed items only (SWR).
  app.get<{
    Params: { id: string };
    Querystring: z.infer<typeof menuDeltaQuerystringSchema>;
  }>(
    "/merchants/:id/menu/delta",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        querystring: menuDeltaQuerystringSchema,
        response: {
          200: z.object({
            menuVersion: z.number(),
            unchanged: z.boolean().optional(),
            requiresFullSync: z.boolean().optional(),
            deletedItemIds: z.array(z.string()).optional(),
            changedItems: z
              .array(
                z.object({
                  id: z.string(),
                  menuItemId: z.number(),
                  name: z.string(),
                  description: z.string().optional(),
                  price: z.number(),
                  basePrice: z.number().optional(),
                  imageUrl: z.string().nullable().optional(),
                  isVeg: z.boolean(),
                  foodType: z.string().optional(),
                  spiceLevel: z.string().optional(),
                  category: z.string().optional(),
                  categoryId: z.number().nullable().optional(),
                  categoryName: z.string().nullable().optional(),
                  isPopular: z.boolean().optional(),
                  isRecommended: z.boolean().optional(),
                  prepTimeMinutes: z.number().optional(),
                  discountPercentage: z.number().optional(),
                  hasCustomizations: z.boolean().optional(),
                  hasAddons: z.boolean().optional(),
                  hasVariants: z.boolean().optional(),
                  inStock: z.boolean().optional(),
                })
              )
              .optional(),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const sinceVersion = Number((request.query as { sinceVersion?: number }).sinceVersion ?? 0);
      const delta = await getMenuDelta(id, sinceVersion);
      if (!delta) return reply.status(404).send({ error: "Store not found" });

      const changedItems =
        delta.changedRows
          ?.map((m) => mapCustomerMenuItem(m))
          .filter((row): row is NonNullable<ReturnType<typeof mapCustomerMenuItem>> => row != null) ??
        [];

      return reply.send({
        menuVersion: delta.menuVersion,
        unchanged: delta.unchanged,
        requiresFullSync: delta.requiresFullSync,
        deletedItemIds: delta.deletedItemIds,
        changedItems: changedItems.length > 0 ? changedItems : undefined,
      });
    }
  );

  // GET /v1/merchants/:id/menu – store detail + menu (id = store_id string). Optional ?q= filters menu by item name.
  app.get<{ Params: { id: string }; Querystring: z.infer<typeof menuQuerystringSchema> }>(
    "/merchants/:id/menu",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        querystring: menuQuerystringSchema,
        response: {
          200: z.object({
            id: z.string(),
            name: z.string(),
            imageUrl: z.string().nullable().optional(),
            address: z.string().optional(),
            bannerImages: z.array(z.string()).optional(),
            latitude: z.number().nullable().optional(),
            longitude: z.number().nullable().optional(),
            operationalStatus: z.string().nullable().optional(),
            isOpen: z.boolean().optional(),
            acceptingOrders: z.boolean().optional(),
            avgPreparationTimeMinutes: z.number().nullable().optional(),
            etaMinMinutes: z.number().optional(),
            etaMaxMinutes: z.number().optional(),
            city: z.string().nullable().optional(),
            menu: z.array(
              z.object({
                id: z.string(),
                menuItemId: z.number(),
                name: z.string(),
                description: z.string().optional(),
                price: z.number(),
                basePrice: z.number().optional(),
                imageUrl: z.string().nullable().optional(),
                isVeg: z.boolean(),
                foodType: z.string().optional(),
                spiceLevel: z.string().optional(),
                category: z.string().optional(),
                categoryId: z.number().nullable().optional(),
                categoryName: z.string().nullable().optional(),
                isPopular: z.boolean().optional(),
                isRecommended: z.boolean().optional(),
                prepTimeMinutes: z.number().optional(),
                discountPercentage: z.number().optional(),
                hasCustomizations: z.boolean().optional(),
                hasAddons: z.boolean().optional(),
                hasVariants: z.boolean().optional(),
              })
            ),
            cuisines: z.array(z.string()).optional(),
            avgRating: z.number().nullable().optional(),
            totalReviews: z.number().nullable().optional(),
            forYouRating: z.number().nullable().optional(),
            userHasRatedStore: z.boolean().optional(),
            liveStatus: z.enum(["OPEN", "CLOSED"]).optional(),
            nextOpenAt: z.string().nullable().optional(),
            nextCloseAt: z.string().nullable().optional(),
            rushActive: z.boolean().optional(),
            rushEndsAt: z.string().nullable().optional(),
            rushRemainingMinutes: z.number().nullable().optional(),
            menuVersion: z.number().optional(),
            etag: z.string().optional(),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const q = (request.query as { q?: string }).q;

      const versionInfo = q?.trim() ? null : await getMenuVersion(id);
      if (versionInfo) {
        const ifNoneMatch = request.headers["if-none-match"];
        if (ifNoneMatch && ifNoneMatch === versionInfo.etag) {
          return reply.status(304).send();
        }
      }

      const { store, items } = await getMenuByStoreId(id, q);
      if (!store) {
        return reply.status(404).send({ error: "Store not found" });
      }
      // Empty / fully locked catalogs must not be customer-visible (deep links included).
      if (!(await assertStoreHasCustomerVisibleMenu(store))) {
        return reply.status(404).send({ error: "Store not found" });
      }
      const storeInternalId = Number(store.id);
      const ratingSummaries =
        Number.isFinite(storeInternalId) && storeInternalId > 0
          ? await getStoreRatingsForStores([storeInternalId])
          : new Map();
      const rating = ratingSummaries.get(storeInternalId);
      let forYouRating: number | null = null;
      let userHasRatedStore = false;
      if (request.auth?.role === "customer") {
        const customerPk = await resolveCustomerPkForRequest(request.auth, request);
        if (customerPk != null && Number.isFinite(storeInternalId) && storeInternalId > 0) {
          const personalized = await getStorePersonalizedRating(storeInternalId, customerPk);
          forYouRating = personalized.forYouRating;
          userHasRatedStore = personalized.userHasRatedStore;
        }
      }
      const bannerImages: string[] = [];
      const gallery = store.gallery_images ?? [];
      if (Array.isArray(gallery) && gallery.length > 0) bannerImages.push(...gallery.filter(Boolean));
      if (bannerImages.length === 0 && store.banner_url) bannerImages.push(store.banner_url);

      const menu = items
        .map((m) => mapCustomerMenuItem(m))
        .filter((row): row is NonNullable<ReturnType<typeof mapCustomerMenuItem>> => row != null);

      const menuAvgPrep = averagePrepMinutesFromMenuItemRows(items);
      const prepBuffers = await getPreparationBufferMinutesForStores(
        Number.isFinite(storeInternalId) && storeInternalId > 0 ? [storeInternalId] : []
      );
      const prepBuffer = prepBuffers.get(storeInternalId) ?? 0;
      const prepMin = resolveStorePrepMinutesForEta(
        menuAvgPrep,
        store.avg_preparation_time_minutes,
        prepBuffer
      );

      const surface = await getStoreSurfaceLiveStatus(id, request.log);
      if (!surface) {
        return reply.status(404).send({ error: "Store not found" });
      }
      const liveStatus = surface.liveStatus;
      const isOpen = liveStatus === "OPEN";
      const sched = {
        nextOpenAt: surface.nextOpenAt,
        nextCloseAt: surface.nextCloseAt,
      };
      const bannerImagesAbsolute = bannerImages
        .map((u) => toAbsoluteClientMediaUrl(u))
        .filter((u): u is string => Boolean(u));

      return reply.send({
        id: store.store_id,
        name: store.store_display_name ?? store.store_name,
        imageUrl: toAbsoluteClientMediaUrl(store.banner_url ?? null) ?? undefined,
        address: store.store_description ?? undefined,
        bannerImages: bannerImagesAbsolute.length > 0 ? bannerImagesAbsolute : undefined,
        latitude: store.latitude != null ? Number(store.latitude) : undefined,
        longitude: store.longitude != null ? Number(store.longitude) : undefined,
        operationalStatus: store.operational_status ?? undefined,
        isOpen,
        liveStatus,
        acceptingOrders: store.is_accepting_orders === true,
        avgPreparationTimeMinutes: prepMin ?? undefined,
        city: store.city ?? undefined,
        menu,
        cuisines: store.cuisine_types ?? undefined,
        avgRating: rating?.avgRating ?? null,
        totalReviews: rating?.totalReviews ?? null,
        forYouRating,
        userHasRatedStore,
        nextOpenAt: sched?.nextOpenAt ?? null,
        nextCloseAt: sched?.nextCloseAt ?? null,
        rushActive: surface.activeRush?.isActive === true,
        rushEndsAt: surface.activeRush?.endsAt ?? null,
        rushRemainingMinutes: surface.activeRush?.remainingMinutes ?? null,
        menuVersion: versionInfo?.menuVersion,
        etag: versionInfo?.etag,
      });
    }
  );

  // GET /v1/search – unified search (dishes + stores)
  app.get(
    "/search",
    {
      schema: {
        querystring: searchQuerySchema,
        response: {
          200: z.object({
            dishes: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                imageKey: z.string().optional(),
                restaurantName: z.string().optional(),
                storeId: z.string().optional(),
                price: z.number().optional(),
                isVeg: z.boolean().optional(),
              })
            ),
            stores: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                imageUrl: z.string().nullable().optional(),
                cuisines: z.array(z.string()).optional(),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const q = request.query as z.infer<typeof searchQuerySchema>;
      const { dishes: items, stores } = await search({
        q: (q.q ?? "").trim(),
        limit: q.limit,
        offset: q.offset,
        lat: q.lat,
        lng: q.lng,
        veg_mode: q.veg ?? false,
      });
      const storeMap = new Map(stores.map((s) => [s.id, s]));
      const dishes = items.map((m) => {
        const store = storeMap.get(m.store_id);
        return {
          id: m.item_id,
          menuItemId: m.id,
          name: m.item_name,
          imageKey: "default",
          restaurantName: store?.store_display_name ?? store?.store_name,
          storeId: store?.store_id,
          price: parseFloat(m.selling_price),
          isVeg: (m.food_type ?? "").toLowerCase().startsWith("veg"),
        };
      });
      const storeList = stores.map((s) => ({
        id: s.store_id,
        name: s.store_display_name ?? s.store_name,
        imageUrl: toAbsoluteClientMediaUrl(s.banner_url ?? null) ?? undefined,
        cuisines: s.cuisine_types ?? undefined,
      }));
      return reply.send({ dishes, stores: storeList });
    }
  );

  // GET /v1/user-app/categories – category tiles (name + image) per store_type; only status=active
  app.get(
    "/user-app/categories",
    {
      schema: {
        querystring: userAppCategoriesQuerySchema,
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.number(),
                name: z.string(),
                imageUrl: z.string().nullable(),
                displayOrder: z.number(),
                storeType: z.string(),
                status: z.string(),
              })
            ),
            allTab: z.object({
              label: z.string(),
              imageUrl: z.string().nullable(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const q = request.query as z.infer<typeof userAppCategoriesQuerySchema>;
      const result = await listUserAppCategories({ storeType: q.store_type });
      return reply.send(result);
    }
  );

  const itemsUnderPriceQuerySchema = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    max_price: z.coerce.number().min(1).max(5000).optional(),
    limit: z.coerce.number().min(1).max(24).optional(),
    veg: z.coerce.boolean().optional(),
  });

  app.get(
    "/food-home/items-under-price",
    {
      schema: {
        querystring: itemsUnderPriceQuerySchema,
        response: {
          200: z.object({
            items: z.array(
              z.object({
                itemId: z.string(),
                menuItemPk: z.number(),
                name: z.string(),
                imageUrl: z.string().nullable(),
                price: z.number(),
                basePrice: z.number().nullable(),
                discountPercentage: z.number().nullable(),
                storePublicId: z.string(),
                storeName: z.string(),
                isVeg: z.boolean(),
                isPopular: z.boolean(),
                itemTags: z.array(z.string()),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const q = request.query as z.infer<typeof itemsUnderPriceQuerySchema>;
      const items = await listFoodItemsUnderPrice({
        lat: q.lat,
        lng: q.lng,
        maxPrice: q.max_price ?? 250,
        limit: q.limit,
        vegOnly: q.veg === true,
      });
      return reply.send({ items });
    }
  );

  const itemsUnderPriceGroupedQuerySchema = itemsUnderPriceQuerySchema.extend({
    max_stores: z.coerce.number().min(1).max(20).optional(),
    items_per_store: z.coerce.number().min(1).max(10).optional(),
  });

  app.get(
    "/food-home/items-under-price/grouped",
    {
      schema: {
        querystring: itemsUnderPriceGroupedQuerySchema,
        response: {
          200: z.object({
            stores: z.array(
              z.object({
                storePublicId: z.string(),
                storeName: z.string(),
                avgRating: z.number().nullable(),
                totalReviews: z.number().nullable(),
                deliveryTime: z.string().nullable(),
                distanceKm: z.number().nullable(),
                items: z.array(
                  z.object({
                    itemId: z.string(),
                    menuItemPk: z.number(),
                    name: z.string(),
                    imageUrl: z.string().nullable(),
                    price: z.number(),
                    basePrice: z.number().nullable(),
                    discountPercentage: z.number().nullable(),
                    storePublicId: z.string(),
                    storeName: z.string(),
                    isVeg: z.boolean(),
                    isPopular: z.boolean(),
                    itemTags: z.array(z.string()),
                  })
                ),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const q = request.query as z.infer<typeof itemsUnderPriceGroupedQuerySchema>;
      const stores = await listFoodItemsUnderPriceGrouped({
        lat: q.lat,
        lng: q.lng,
        maxPrice: q.max_price ?? 250,
        vegOnly: q.veg === true,
        maxStores: q.max_stores,
        itemsPerStore: q.items_per_store,
      });
      return reply.send({ stores });
    }
  );
}
