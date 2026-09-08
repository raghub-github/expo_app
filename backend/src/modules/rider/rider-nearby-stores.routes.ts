import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSupabase } from "../../lib/supabase.js";

/**
 * GET /v1/rider/nearby-stores?lat=&lng=&radiusKm=20&all=false
 *
 * Rider map "Nearby Stores" DISCOVERY layer — completely independent of Hot Zones. Hot Zones
 * show where there is genuine demand/supply opportunity; this shows where food stores actually
 * EXIST within the rider's radius so the rider can move toward them even when no zone is hot.
 *
 * - Centred on the rider's LATEST GPS (passed by the app), not the login location.
 * - AIR (straight-line) distance ≤ radiusKm (default 20km) — matches how coverage circles are
 *   measured; bbox prefilter + haversine trim, DB-indexed, no per-row app loop over all stores.
 * - Default returns only currently OPEN/available stores (Phase 8); `all=true` includes listed
 *   but offline stores.
 * - Minimal, non-sensitive fields only (id/name/coords/open) — no customer or internal data.
 * - Rendered by the app with Mapbox native clustering, so a large radius never floods the map.
 */

function parseRiderIdFromAuth(sub: string): number | null {
  const match = sub.match(/usr_(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(25).optional().default(20),
  all: z.string().optional(),
});

/** Hard cap on markers returned to the app (clustering handles density; this bounds payload). */
const MAX_STORES = 400;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

type StoreRow = {
  id: number | string;
  store_id: string | null;
  store_name: string | null;
  store_display_name: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  is_available: boolean | null;
  is_accepting_orders: boolean | null;
  operational_status: string | null;
};

export function registerRiderNearbyStoresRoutes(app: FastifyInstance) {
  app.get("/nearby-stores", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }
    const q = querySchema.safeParse(req.query ?? {});
    if (!q.success) {
      return reply.code(400).send({ success: false, error: "invalid_query" });
    }
    const { lat, lng, radiusKm } = q.data;
    const includeAll = q.data.all === "true" || q.data.all === "1";

    try {
      // Bbox prefilter sized to the radius (air). 1 lat degree ≈ 111.32km; lng scaled by cos(lat).
      const latDelta = radiusKm / 111.32;
      const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.1);
      const lngDelta = radiusKm / (111.32 * cosLat);

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("merchant_stores")
        .select(
          "id, store_id, store_name, store_display_name, latitude, longitude, is_available, is_accepting_orders, operational_status",
        )
        .eq("status", "ACTIVE")
        .eq("is_active", true)
        .gte("latitude", lat - latDelta)
        .lte("latitude", lat + latDelta)
        .gte("longitude", lng - lngDelta)
        .lte("longitude", lng + lngDelta)
        .limit(1200); // bbox keeps this small; hard cap avoids a runaway scan
      if (error) throw error;

      const rows = (data ?? []) as StoreRow[];
      const stores = rows
        .map((s) => {
          const slat = Number(s.latitude);
          const slng = Number(s.longitude);
          if (!Number.isFinite(slat) || !Number.isFinite(slng)) return null;
          const distanceKm = haversineKm(lat, lng, slat, slng);
          if (distanceKm > radiusKm) return null;
          const isOpen =
            s.is_available !== false &&
            s.is_accepting_orders !== false &&
            String(s.operational_status ?? "").toUpperCase() !== "CLOSED";
          if (!includeAll && !isOpen) return null;
          return {
            id: String(s.store_id ?? s.id),
            name: s.store_display_name?.trim() || s.store_name?.trim() || "Store",
            lat: slat,
            lng: slng,
            isOpen,
            distanceKm: Math.round(distanceKm * 10) / 10,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, MAX_STORES);

      return reply.send({ success: true, radiusKm, count: stores.length, stores });
    } catch (err) {
      app.log.error({ err }, "GET /rider/nearby-stores failed");
      return reply.code(500).send({ success: false, error: "failed_to_load_stores" });
    }
  });
}
