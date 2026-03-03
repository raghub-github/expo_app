"use client";

import { useEffect, useRef, useState } from "react";
import { mapCache } from "@/lib/map-cache";

interface VerificationLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  onCoordinatesChange: (lat: number, lng: number) => void;
  onReverseGeocode?: (address: { place_name?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null }) => void;
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [78.0, 22.0]; // India
const DEFAULT_ZOOM = 10;

export function VerificationLocationMap({
  latitude,
  longitude,
  onCoordinatesChange,
  onReverseGeocode,
  className = "",
}: VerificationLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    const token = typeof process !== "undefined" && process.env?.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!container || !token) {
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

        const hasCoords = latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude);
        const center: [number, number] = hasCoords ? [longitude, latitude] : DEFAULT_CENTER;

        const map = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/streets-v12",
          center,
          zoom: hasCoords ? 14 : DEFAULT_ZOOM,
        });

        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;
          const marker = new mapboxgl.Marker({ draggable: true })
            .setLngLat(center)
            .addTo(map);
          markerRef.current = marker;

          marker.on("dragend", () => {
            const lngLat = marker.getLngLat();
            onCoordinatesChange(lngLat.lat, lngLat.lng);
          });

          map.on("click", (e: { lngLat: { lat: number; lng: number } }) => {
            const { lng, lat } = e.lngLat;
            marker.setLngLat([lng, lat]);
            onCoordinatesChange(lat, lng);
          });

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
      if (markerRef.current) markerRef.current.remove();
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (_) {}
        mapRef.current = null;
      }
    };
  }, []);

  // Update marker position when latitude/longitude change from parent (e.g. manual input)
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const hasCoords = latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude);
    if (hasCoords) {
      marker.setLngLat([longitude, latitude]);
      map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 12), duration: 500 });
    }
  }, [latitude, longitude]);

  if (error) {
    return (
      <div className={`rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 ${className}`}>
        {error}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded border border-gray-200 bg-gray-50 text-xs text-gray-500">
          Loading map…
        </div>
      )}
      <div ref={containerRef} className="h-[220px] w-full rounded border border-gray-200" style={{ minHeight: 220 }} />
      <p className="mt-1 text-[10px] text-gray-500">Click the map or drag the marker to set store location. Coordinates update automatically.</p>
      {onReverseGeocode && latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude) && (
        <button
          type="button"
          onClick={async () => {
            try {
              const res = await fetch(`/api/merchant/reverse-geocode?lat=${latitude}&lng=${longitude}`);
              const data = await res.json();
              if (data?.success && data.place_name) {
                onReverseGeocode({
                  place_name: data.place_name,
                  city: data.city ?? null,
                  state: data.state ?? null,
                  postal_code: data.postal_code ?? null,
                  country: data.country ?? null,
                });
              }
            } catch (_) {}
          }}
          className="mt-2 cursor-pointer rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Fill address from coordinates
        </button>
      )}
    </div>
  );
}
