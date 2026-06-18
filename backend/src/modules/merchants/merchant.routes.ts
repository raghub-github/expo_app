import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  listStores,
  getMenuByStoreId,
  getStoreLiveStatus,
  getMenuItemFullConfig,
  getOrderedTogetherPairs,
  getOrderedTogetherRecommendations,
  search,
  listNearbyStoresByRoadDistance,
} from "./merchant.service.js";
import { listUserAppCategories } from "./userAppCategory.service.js";
import type { NearbyStoreRow } from "./merchant.types.js";
import { computeLiveStatus } from "./merchant.types.js";
import { getPrimaryOfferHeadlinesForStores } from "./merchant-offer-headline.js";
import { getStoreRatingsForStores } from "./merchant-store-ratings.js";
import { getScheduleTimesForStores } from "./merchant-store-schedule-times.js";
import { getCompletedOrderCountsForStores } from "./merchant-store-order-stats.js";
import {
  averagePrepMinutesFromMenuItemRows,
  getAverageMenuPrepMinutesForStores,
  resolveStorePrepMinutesForEta,
} from "./merchant-menu-prep.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";
import { previewEtaRange } from "../eta/eta.preview.js";
import type { MerchantMenuItemRow } from "./merchant.types.js";

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
  m: MerchantMenuItemRow & { category_name?: string | null }
) {
  const menuItemId = toFiniteInt(m.id);
  const price = toFiniteNumber(m.selling_price);
  if (menuItemId == null || price == null) return null;

  const categoryId = toFiniteInt(m.category_id);
  const basePrice = toFiniteNumber(m.base_price);
  const discountPercentage = toFiniteNumber(m.discount_percentage);
  const prepTimeMinutes = toFiniteInt(m.preparation_time_minutes);

  return {
    id: String(m.item_id ?? ""),
    menuItemId,
    name: String(m.item_name ?? "Item"),
    description: m.item_description ?? undefined,
    price,
    basePrice,
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
  /** Distance mode: air = straight-line (DB/RPC), road = routing engine (Mapbox/OSRM). */
  distanceMode: z
    .enum(["air", "road"])
    .optional()
    .default("air"),
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
                completedOrderCount: z.number().optional(),
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
      const [offerHeadlines, ratingSummaries, scheduleTimes, orderCounts, menuPrepAvgs] =
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
      ]);

      const body = items.map((s) => {
        const nearby = s as NearbyStoreRow;
        const storeInternalId = Number(s.id);
        const displayImageRaw =
          nearby.display_image ??
          s.banner_url ??
          (Array.isArray(s.gallery_images) && s.gallery_images[0] ? s.gallery_images[0] : null) ??
          null;
        const displayImage = toAbsoluteClientMediaUrl(displayImageRaw);
        const bannerAbs = toAbsoluteClientMediaUrl(s.banner_url ?? null);
        const galleryRaw = Array.isArray(s.gallery_images) ? s.gallery_images : [];
        const galleryImages = galleryRaw
          .map((u) => toAbsoluteClientMediaUrl(typeof u === "string" ? u : null))
          .filter((u): u is string => Boolean(u))
          .filter((u) => u !== bannerAbs && u !== displayImage);
        const storeLevelPrep = nearby.avg_preparation_time_minutes ?? s.avg_preparation_time_minutes;
        const menuAvgPrep =
          Number.isFinite(storeInternalId) && storeInternalId > 0
            ? menuPrepAvgs.get(storeInternalId) ?? null
            : null;
        const prepMin = resolveStorePrepMinutesForEta(menuAvgPrep, storeLevelPrep);
        // ETA range: canonical "(prep + distance/18kmh) + 5..10 min buffer"
        // formula stamped server-side so list, merchant detail header, and
        // checkout all show the same numbers for one store.
        const etaRange = previewEtaRange({
          distanceKm: "distance_km" in s ? (nearby.distance_km as number) : null,
          prepMinutes: prepMin,
        });
        const rawLiveStatus = (s as NearbyStoreRow).live_status;
        const normalized =
          typeof rawLiveStatus === "string" ? rawLiveStatus.trim().toUpperCase() : "";
        const liveStatus: "OPEN" | "CLOSED" =
          normalized === "OPEN" || normalized === "CLOSED"
            ? normalized
            : computeLiveStatus({
                is_active: s.is_active,
                is_available: (s as { is_available?: boolean | null }).is_available,
                is_accepting_orders: s.is_accepting_orders,
                operational_status: (s as { operational_status?: string | null }).operational_status,
              });
        const isOpen = liveStatus === "OPEN";
        const sched =
          Number.isFinite(storeInternalId) && storeInternalId > 0
            ? scheduleTimes.get(storeInternalId)
            : undefined;
        return {
          id: s.store_id,
          name: s.store_display_name ?? s.store_name,
          displayImage,
          banner_url: bannerAbs ?? displayImage ?? null,
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
          galleryImages: galleryImages.length > 0 ? galleryImages : undefined,
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
          nextCloseAt: sched?.nextCloseAt ?? null,
          nextOpenAt: sched?.nextOpenAt ?? null,
          completedOrderCount:
            Number.isFinite(storeInternalId) && storeInternalId > 0
              ? orderCounts.get(storeInternalId) ?? 0
              : 0,
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
            nextOpenAt: z.string().nullable().optional(),
            nextCloseAt: z.string().nullable().optional(),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { getStoreByStoreId } = await import("./merchant.service.js");
      const store = await getStoreByStoreId(id);
      if (!store) return reply.status(404).send({ error: "Store not found" });
      const liveStatus = await getStoreLiveStatus(id);
      if (liveStatus == null) return reply.status(404).send({ error: "Store not found" });
      const internalId = Number(store.id);
      const sched =
        Number.isFinite(internalId) && internalId > 0
          ? (await getScheduleTimesForStores([internalId])).get(internalId)
          : undefined;
      return reply.send({
        liveStatus,
        nextOpenAt: sched?.nextOpenAt ?? null,
        nextCloseAt: sched?.nextCloseAt ?? null,
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
            delivery_radius_km: z.number().nullable().optional(),
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
            liveStatus: z.enum(["OPEN", "CLOSED"]).optional(),
            nextOpenAt: z.string().nullable().optional(),
            nextCloseAt: z.string().nullable().optional(),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const q = (request.query as { q?: string }).q;
      const { store, items } = await getMenuByStoreId(id, q);
      if (!store) {
        return reply.status(404).send({ error: "Store not found" });
      }
      const storeInternalId = Number(store.id);
      const ratingSummaries =
        Number.isFinite(storeInternalId) && storeInternalId > 0
          ? await getStoreRatingsForStores([storeInternalId])
          : new Map();
      const rating = ratingSummaries.get(storeInternalId);
      const bannerImages: string[] = [];
      const gallery = store.gallery_images ?? [];
      if (Array.isArray(gallery) && gallery.length > 0) bannerImages.push(...gallery.filter(Boolean));
      if (bannerImages.length === 0 && store.banner_url) bannerImages.push(store.banner_url);

      const menu = items
        .map((m) => mapCustomerMenuItem(m))
        .filter((row): row is NonNullable<ReturnType<typeof mapCustomerMenuItem>> => row != null);

      const menuAvgPrep = averagePrepMinutesFromMenuItemRows(items);
      const prepMin = resolveStorePrepMinutesForEta(
        menuAvgPrep,
        store.avg_preparation_time_minutes
      );

      const rawLiveStatus = (store as { live_status?: string | null }).live_status;
      const liveStatus =
        rawLiveStatus === "OPEN" || rawLiveStatus === "CLOSED"
          ? rawLiveStatus
          : computeLiveStatus({
              is_active: store.is_active,
              is_available: store.is_available,
              is_accepting_orders: store.is_accepting_orders,
              operational_status: store.operational_status,
            });
      const isOpen = liveStatus === "OPEN";
      const sched =
        Number.isFinite(storeInternalId) && storeInternalId > 0
          ? (await getScheduleTimesForStores([storeInternalId])).get(storeInternalId)
          : undefined;
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
        nextOpenAt: sched?.nextOpenAt ?? null,
        nextCloseAt: sched?.nextCloseAt ?? null,
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
          }),
        },
      },
    },
    async (request, reply) => {
      const q = request.query as z.infer<typeof userAppCategoriesQuerySchema>;
      const items = await listUserAppCategories({ storeType: q.store_type });
      return reply.send({ items });
    }
  );
}
