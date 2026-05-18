import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  listStores,
  getMenuByStoreId,
  getStoreLiveStatus,
  getMenuItemFullConfig,
  search,
  listNearbyStoresByRoadDistance,
} from "./merchant.service.js";
import { listUserAppCategories } from "./userAppCategory.service.js";
import type { NearbyStoreRow } from "./merchant.types.js";
import { computeLiveStatus } from "./merchant.types.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";

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
                cuisines: z.array(z.string()).optional(),
                isOpen: z.boolean(),
                liveStatus: z.enum(["OPEN", "CLOSED"]),
                distanceKm: z.number().optional(),
                offerText: z.string().nullable().optional(),
                nextCloseAt: z.union([z.string(), z.number()]).nullable().optional(),
                nextOpenAt: z.union([z.string(), z.number()]).nullable().optional(),
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
      const body = items.map((s) => {
        const nearby = s as NearbyStoreRow;
        const displayImageRaw =
          nearby.display_image ??
          s.banner_url ??
          (Array.isArray(s.gallery_images) && s.gallery_images[0] ? s.gallery_images[0] : null) ??
          null;
        const displayImage = toAbsoluteClientMediaUrl(displayImageRaw);
        const bannerAbs = toAbsoluteClientMediaUrl(s.banner_url ?? null);
        const prepMin = nearby.avg_preparation_time_minutes ?? s.avg_preparation_time_minutes;
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
        return {
          id: s.store_id,
          name: s.store_display_name ?? s.store_name,
          displayImage,
          banner_url: bannerAbs ?? displayImage ?? null,
          deliveryTime: prepMin != null ? `${prepMin} min` : undefined,
          cuisines: s.cuisine_types ?? undefined,
          isOpen,
          liveStatus,
          distanceKm: "distance_km" in s ? nearby.distance_km : undefined,
          offerText: null,
          nextCloseAt: (s as { next_close_at?: string | number | null }).next_close_at ?? null,
          nextOpenAt: (s as { next_open_at?: string | number | null }).next_open_at ?? null,
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
                displayOrder: z.number(),
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

  // GET /v1/merchants/:id/live-status – single source of truth for OPEN/CLOSED. Used by list, detail, cart, checkout, group order.
  app.get<{ Params: { id: string } }>(
    "/merchants/:id/live-status",
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: {
          200: z.object({ liveStatus: z.enum(["OPEN", "CLOSED"]) }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const liveStatus = await getStoreLiveStatus(id);
      if (liveStatus == null) return reply.status(404).send({ error: "Store not found" });
      return reply.send({ liveStatus });
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
      return reply.send({
        store_name: store.store_name,
        store_display_name: store.store_display_name ?? null,
        full_address: store.full_address ?? store.store_description ?? null,
        city: store.city ?? null,
        state: (store as { state?: string | null }).state ?? null,
        postal_code: store.postal_code ?? null,
        cuisine_types: store.cuisine_types ?? null,
        operational_status: store.operational_status ?? null,
        avg_preparation_time_minutes: store.avg_preparation_time_minutes ?? null,
        packaging_charge_amount: (store as { packaging_charge_amount?: number | null }).packaging_charge_amount ?? null,
        delivery_charge_per_km: (store as { delivery_charge_per_km?: number | null }).delivery_charge_per_km ?? null,
        delivery_radius_km: (store as { delivery_radius_km?: number | null }).delivery_radius_km ?? null,
        banner_url: store.banner_url ?? null,
        is_active: store.is_active ?? null,
        created_at: store.created_at ?? null,
      });
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
        imageUrl: toAbsoluteClientMediaUrl(m.item_image_url ?? null) ?? undefined,
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
