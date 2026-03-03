"use client";

import { useEffect, useRef, useState } from "react";
import { mapCache } from "@/lib/map-cache";

interface RiderRouteMapProps {
  pickupLat: number | null | undefined;
  pickupLon: number | null | undefined;
  dropLat: number | null | undefined;
  dropLon: number | null | undefined;
}

export default function RiderRouteMap({
  pickupLat,
  pickupLon,
  dropLat,
  dropLon,
}: RiderRouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const hasCoords =
    pickupLat != null &&
    pickupLon != null &&
    dropLat != null &&
    dropLon != null &&
    Number.isFinite(pickupLat) &&
    Number.isFinite(pickupLon) &&
    Number.isFinite(dropLat) &&
    Number.isFinite(dropLon);

  useEffect(() => {
    const container = containerRef.current;
    const token =
      (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_MAPBOX_TOKEN) ||
      (typeof process !== "undefined" && process.env?.MAPBOX_PUBLIC_TOKEN);

    if (!container || !token || !hasCoords) {
      setLoading(false);
      if (!token) setError("Mapbox token not configured");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await mapCache.loadMapboxScript();
        if (cancelled) return;

        const mapboxgl = (window as any).mapboxgl;
        if (!mapboxgl) {
          setError("Mapbox library not available");
          setLoading(false);
          return;
        }

        mapboxgl.accessToken = token;

        const start: [number, number] = [Number(pickupLon), Number(pickupLat)];
        const end: [number, number] = [Number(dropLon), Number(dropLat)];

        const map = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/streets-v12",
          center: start,
          zoom: 13,
        });

        mapRef.current = map;

        map.on("load", async () => {
          if (cancelled) return;

          // Markers
          new mapboxgl.Marker({ color: "#f59e0b" }).setLngLat(start).addTo(map);
          new mapboxgl.Marker({ color: "#ec4899" }).setLngLat(end).addTo(map);

          map.fitBounds(
            [
              [Math.min(start[0], end[0]), Math.min(start[1], end[1])],
              [Math.max(start[0], end[0]), Math.max(start[1], end[1])],
            ],
            { padding: 40, duration: 600 }
          );

          // Directions route
          try {
            const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson&access_token=${encodeURIComponent(
              token
            )}`;
            const res = await fetch(url);
            const json = await res.json();
            const route = json?.routes?.[0];
            const geometry = route?.geometry;

            if (geometry?.coordinates) {
              const sourceId = "rider-route";
              if (!map.getSource(sourceId)) {
                map.addSource(sourceId, {
                  type: "geojson",
                  data: {
                    type: "Feature",
                    geometry: {
                      type: "LineString",
                      coordinates: geometry.coordinates,
                    },
                  },
                });
                map.addLayer({
                  id: "rider-route-line",
                  type: "line",
                  source: sourceId,
                  paint: {
                    "line-color": "#ec4899",
                    "line-width": 4,
                  },
                });
              }
            }
          } catch {
            // Ignore route errors; map with markers is still useful
          }

          setLoading(false);
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load map");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          // ignore
        }
        mapRef.current = null;
      }
    };
  }, [hasCoords, pickupLat, pickupLon, dropLat, dropLon]);

  return (
    <div className="bg-white rounded-lg px-3 py-2 shadow-sm border border-[#e5e5e5]">
      <div className="mb-2 pb-1.5 border-b border-[#e5e5e5] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-gati-text-primary flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-sky-700 text-xs font-semibold">
            M
          </span>
          <span>Rider route</span>
        </span>
      </div>
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded border border-gray-200 bg-gray-50 text-[11px] text-gray-500">
            Loading map…
          </div>
        )}
        {error ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
            {error}
          </div>
        ) : (
          <div
            ref={containerRef}
            className="h-[230px] w-full rounded border border-gray-200"
            style={{ minHeight: 230 }}
          />
        )}
      </div>
    </div>
  );
}

