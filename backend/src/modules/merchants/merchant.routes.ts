import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  listStores,
  getMenuByStoreId,
  getStoreLiveStatus,
  getMenuItemFullConfig,
  getOrderedTogetherPairs,
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
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";
import { previewEtaRange } from "../eta/eta.preview.js";

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
      const [offerHeadlines, ratingSummaries, scheduleTimes, orderCounts] = await Promise.all([
        settleEnrichment("offer-headlines", getPrimaryOfferHeadlinesForStores(storeInternalIds), new Map()),
        settleEnrichment("rating-summaries", getStoreRatingsForStores(storeInternalIds), new Map()),
        settleEnrichment("schedule-times", getScheduleTimesForStores(storeInternalIds), new Map()),
        settleEnrichment("order-counts", getCompletedOrderCountsForStores(storeInternalIds), new Map()),
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
        const prepMin = nearby.avg_preparation_time_minutes ?? s.avg_preparation_time_minutes;
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

  // GET /v1/merchants/:id/menu/ordered-together – item pairs frequently ordered together at this store.
  app.get<{ Params: { id: string } }>(
    "/merchants/:id/menu/ordered-together",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
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
      const pairs = await getOrderedTogetherPairs(storeId);
      return reply.send({ pairs });
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
                imageUrl: z.string().nullable().optional(),
                isVeg: z.boolean(),
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

      const menu = items.map((m) => ({
        id: m.item_id,
        menuItemId: m.id,
        name: m.item_name,
        description: m.item_description ?? undefined,
        price: parseFloat(m.selling_price),
        basePrice:
          m.base_price != null && Number.isFinite(parseFloat(String(m.base_price)))
            ? parseFloat(String(m.base_price))
            : undefined,
        imageUrl: toAbsoluteClientMediaUrl(m.item_image_url ?? null) ?? undefined,
        foodType: m.food_type ?? undefined,
        spiceLevel: (m as { spice_level?: string | null }).spice_level ?? undefined,
        isVeg: (m.food_type ?? "").toLowerCase().startsWith("veg"),
        category: m.cuisine_type ?? (m as { category_name?: string | null }).category_name ?? undefined,
        categoryId: m.category_id ?? undefined,
        categoryName: (m as { category_name?: string | null }).category_name ?? undefined,
        isPopular: m.is_popular ?? undefined,
        isRecommended: m.is_recommended ?? undefined,
        prepTimeMinutes: m.preparation_time_minutes ?? undefined,
        discountPercentage: m.discount_percentage != null ? parseFloat(String(m.discount_percentage)) : undefined,
        hasCustomizations: (m as { has_customizations?: boolean }).has_customizations ?? false,
        hasAddons: (m as { has_addons?: boolean }).has_addons ?? false,
        hasVariants: (m as { has_variants?: boolean }).has_variants ?? false,
      }));

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
        avgPreparationTimeMinutes: store.avg_preparation_time_minutes ?? undefined,
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
