"use client";

import { useEffect, useRef } from "react";
import { circlePolygonGeoJson } from "@/lib/food-delivery-map-phase";

export type GeoRiderMapMarker = {
  id: number;
  lat: number;
  lng: number;
  status: string;
  name?: string | null;
};

type Props = {
  mapboxToken: string;
  center: { lat: number; lng: number };
  radiusKm: number;
  riders: GeoRiderMapMarker[];
  className?: string;
};

function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (s === "ONLINE") return "#22c55e";
  if (s === "BUSY") return "#f97316";
  return "#ef4444";
}

export function GeoRiderAvailabilityMap({
  mapboxToken,
  center,
  radiusKm,
  riders,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const centerMarkerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current || !mapboxToken) return;

    const ensureCss = () => {
      if (document.getElementById("mapbox-gl-css")) return;
      const link = document.createElement("link");
      link.id = "mapbox-gl-css";
      link.rel = "stylesheet";
      link.href = "https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css";
      document.head.appendChild(link);
    };

    const init = async () => {
      ensureCss();
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = mapboxToken;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [center.lng, center.lat],
        zoom: 12,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;
        const circle = circlePolygonGeoJson(center.lng, center.lat, radiusKm * 1000);
        if (map.getSource("search-radius")) {
          (map.getSource("search-radius") as any).setData(circle);
        } else {
          map.addSource("search-radius", { type: "geojson", data: circle });
          map.addLayer({
            id: "search-radius-fill",
            type: "fill",
            source: "search-radius",
            paint: { "fill-color": "#3b82f6", "fill-opacity": 0.12 },
          });
          map.addLayer({
            id: "search-radius-line",
            type: "line",
            source: "search-radius",
            paint: { "line-color": "#3b82f6", "line-width": 2, "line-opacity": 0.7 },
          });
        }

        const el = document.createElement("div");
        el.style.width = "16px";
        el.style.height = "16px";
        el.style.borderRadius = "9999px";
        el.style.background = "#2563eb";
        el.style.border = "3px solid #fff";
        el.style.boxShadow = "0 1px 6px rgba(37,99,235,0.55)";
        centerMarkerRef.current?.remove();
        centerMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat([center.lng, center.lat])
          .addTo(map);

        for (const m of markersRef.current) m.remove();
        markersRef.current = [];
        for (const r of riders) {
          const dot = document.createElement("div");
          dot.style.width = "12px";
          dot.style.height = "12px";
          dot.style.borderRadius = "9999px";
          dot.style.background = statusColor(r.status);
          dot.style.border = "2px solid #fff";
          dot.style.boxShadow = "0 1px 4px rgba(0,0,0,0.25)";
          const marker = new mapboxgl.Marker({ element: dot })
            .setLngLat([r.lng, r.lat])
            .setPopup(
              new mapboxgl.Popup({ offset: 12 }).setHTML(
                `<div style="font-size:12px;font-weight:600">${r.name || `Rider #${r.id}`}</div>
                 <div style="font-size:11px;color:#64748b">${r.status}</div>`
              )
            )
            .addTo(map);
          markersRef.current.push(marker);
        }

        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([center.lng, center.lat]);
        const circlePts = circle.geometry.coordinates[0] ?? [];
        for (const c of circlePts) bounds.extend(c as [number, number]);
        for (const r of riders) bounds.extend([r.lng, r.lat]);
        map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 600 });
      });
    };

    void init();
    return () => {
      cancelled = true;
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      centerMarkerRef.current?.remove();
      centerMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Remount on center/radius change; riders update via dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken, center.lat, center.lng, radiusKm, riders.map((r) => `${r.id}:${r.lat}:${r.lng}:${r.status}`).join("|")]);

  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${className}`}>
      <div ref={containerRef} className="h-full min-h-[320px] w-full" />
    </div>
  );
}
