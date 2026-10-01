"use client";

/**
 * Rider tracking map + timeline (historical breadcrumb replay).
 *
 * Renders every stored GPS fix for one order (the per-minute geo-scoping trail)
 * as a path on Mapbox, with pickup/drop pins and geo-engine violation markers.
 * A time scrubber replays the rider minute-by-minute: dragging/playing moves the
 * rider marker along the real trail and shows time, cumulative distance covered,
 * speed and heading at that point. This is the "Track" view the order page links
 * to — distinct from the live RiderRouteMap (current position + planned route).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { OrderPageOverlay } from "@/components/orders/OrderPageOverlay";

type Breadcrumb = {
  id: number;
  riderId: number | null;
  sessionId: number | null;
  sequence: number | null;
  latitude: number;
  longitude: number;
  headingDegrees: number | null;
  speedKmh: number | null;
  accuracyM: number | null;
  legDistanceM: number;
  cumulativeDistanceM: number;
  at: string | null;
};

type TrackViolation = {
  id: number;
  violationType: "long_stop" | "route_deviation" | "opposite_direction" | string;
  level: number;
  status: string;
  distanceM: number | null;
  durationSeconds: number | null;
  latitude: number | null;
  longitude: number | null;
  message: string | null;
  at: string | null;
};

type TrackPayload = {
  orderId: string;
  pickup: { latitude: number; longitude: number } | null;
  drop: { latitude: number; longitude: number } | null;
  routePolyline: string | null;
  serviceType: string | null;
  status: string | null;
  totalDistanceM: number;
  pointCount: number;
  firstAt: string | null;
  lastAt: string | null;
  breadcrumbs: Breadcrumb[];
  violations: TrackViolation[];
};

const MAP_STYLE = "mapbox://styles/mapbox/standard";
const TRAIL_SOURCE = "gm-track-trail";
const TRAIL_LAYER = "gm-track-trail-line";
const TRAIL_CASING = "gm-track-trail-casing";
const DONE_SOURCE = "gm-track-done";
const DONE_LAYER = "gm-track-done-line";

function token(): string | undefined {
  return (
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_MAPBOX_TOKEN) ||
    (typeof process !== "undefined" && process.env?.MAPBOX_PUBLIC_TOKEN) ||
    undefined
  );
}

function fmtDistance(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
}
function fmtDuration(firstAt: string | null, lastAt: string | null): string {
  if (!firstAt || !lastAt) return "—";
  const sec = Math.max(0, (Date.parse(lastAt) - Date.parse(firstAt)) / 1000);
  if (!Number.isFinite(sec)) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtTime(at: string | null): string {
  if (!at) return "—";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

const VIOLATION_META: Record<string, { label: string; color: string }> = {
  long_stop: { label: "No movement", color: "#f59e0b" },
  opposite_direction: { label: "Wrong direction", color: "#ef4444" },
  route_deviation: { label: "Route deviation", color: "#a855f7" },
};
function violationMeta(type: string) {
  return VIOLATION_META[type] ?? { label: type.replace(/_/g, " "), color: "#64748b" };
}

interface Props {
  isOpen: boolean;
  /** TEXT order id (e.g. GMF100045) — matches order_rider_tracking.order_id. */
  orderIdText: string | null | undefined;
  riderName?: string | null;
  onClose: () => void;
}

export default function RiderTrackingModal({ isOpen, orderIdText, riderName, onClose }: Props) {
  const [data, setData] = useState<TrackPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0); // scrubber index into breadcrumbs
  const [playing, setPlaying] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const riderMarkerRef = useRef<any>(null);
  const staticMarkersRef = useRef<any[]>([]);
  const mapReadyRef = useRef(false);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const crumbs = data?.breadcrumbs ?? [];
  const hasTrail = crumbs.length > 0;

  // ── Fetch trail on open ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !orderIdText) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setIdx(0);
    setPlaying(false);
    void fetch(`/api/orders/${encodeURIComponent(orderIdText)}/track`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as TrackPayload & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error || "Failed to load tracking data");
          setData(null);
          return;
        }
        setData(body);
        setIdx(Math.max(0, (body.breadcrumbs?.length ?? 1) - 1)); // start at latest
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load tracking data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, orderIdText]);

  // ── Map init ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    let disposed = false;
    const tk = token();
    if (!tk) {
      setError((e) => e ?? "Map is not configured (missing Mapbox token).");
      return;
    }
    void import("mapbox-gl").then((mod) => {
      if (disposed) return;
      const mapboxgl = mod.default ?? mod;
      mapboxRef.current = mapboxgl;
      mapboxgl.accessToken = tk;
      const el = containerRef.current;
      if (!el || mapRef.current) return;
      const map = new mapboxgl.Map({
        container: el,
        style: MAP_STYLE,
        center: [77.209, 28.6139],
        zoom: 11,
        pitch: 0,
        attributionControl: false,
      });
      mapRef.current = map;
      map.on("load", () => {
        mapReadyRef.current = true;
        renderTrail();
      });
    });
    return () => {
      disposed = true;
      mapReadyRef.current = false;
      try {
        staticMarkersRef.current.forEach((m) => m.remove?.());
        staticMarkersRef.current = [];
        riderMarkerRef.current?.remove?.();
        riderMarkerRef.current = null;
        mapRef.current?.remove?.();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Draw trail + pins + violations when data arrives ───────────────────
  const renderTrail = useCallback(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl || !mapReadyRef.current || !data) return;

    const line = crumbs
      .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude))
      .map((c) => [c.longitude, c.latitude] as [number, number]);

    const fc = (coords: [number, number][]): GeoJSON.Feature => ({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords.length >= 2 ? coords : [] },
    });

    // Full trail (muted) + "covered so far" overlay (green), both updated on scrub.
    if (!map.getSource(TRAIL_SOURCE)) {
      map.addSource(TRAIL_SOURCE, { type: "geojson", data: fc(line) });
      map.addLayer({
        id: TRAIL_CASING,
        type: "line",
        source: TRAIL_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: TRAIL_LAYER,
        type: "line",
        source: TRAIL_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#94a3b8", "line-width": 3.5, "line-opacity": 0.95 },
      });
    } else {
      map.getSource(TRAIL_SOURCE).setData(fc(line));
    }
    if (!map.getSource(DONE_SOURCE)) {
      map.addSource(DONE_SOURCE, { type: "geojson", data: fc([]) });
      map.addLayer({
        id: DONE_LAYER,
        type: "line",
        source: DONE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#16a34a", "line-width": 4, "line-opacity": 1 },
      });
    }

    // Static markers (pickup / drop / violations) — rebuilt each data load.
    staticMarkersRef.current.forEach((m) => m.remove?.());
    staticMarkersRef.current = [];
    const addPin = (lng: number, lat: number, html: string) => {
      const elp = document.createElement("div");
      elp.innerHTML = html;
      const marker = new mapboxgl.Marker({ element: elp.firstElementChild as HTMLElement, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(map);
      staticMarkersRef.current.push(marker);
    };
    const pinHtml = (bg: string, letter: string, title: string) =>
      `<div title="${title}" style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${bg};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);color:#fff;font-size:11px;font-weight:700;">${letter}</span></div>`;
    const dotHtml = (bg: string, title: string) =>
      `<div title="${title}" style="width:14px;height:14px;border-radius:50%;background:${bg};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);"></div>`;

    if (data.pickup) addPin(data.pickup.longitude, data.pickup.latitude, pinHtml("#2563eb", "P", "Pickup"));
    if (data.drop) addPin(data.drop.longitude, data.drop.latitude, pinHtml("#059669", "D", "Drop"));
    for (const v of data.violations) {
      if (v.latitude == null || v.longitude == null) continue;
      const meta = violationMeta(v.violationType);
      addPin(v.longitude, v.latitude, dotHtml(meta.color, `${meta.label} · L${v.level} · ${v.message ?? ""}`));
    }

    // Rider marker (moves with scrubber).
    const riderEl = document.createElement("div");
    riderEl.style.cssText =
      "width:18px;height:18px;border-radius:50%;background:#111827;border:3px solid #fff;box-shadow:0 0 0 3px rgba(17,24,39,.25);";
    riderMarkerRef.current?.remove?.();
    riderMarkerRef.current = new mapboxgl.Marker({ element: riderEl, anchor: "center" });
    if (line.length) {
      riderMarkerRef.current.setLngLat(line[line.length - 1]).addTo(map);
    }

    // Fit to the whole trail + endpoints.
    try {
      const bounds = new mapboxgl.LngLatBounds();
      let any = false;
      for (const p of line) {
        bounds.extend(p);
        any = true;
      }
      if (data.pickup) {
        bounds.extend([data.pickup.longitude, data.pickup.latitude]);
        any = true;
      }
      if (data.drop) {
        bounds.extend([data.drop.longitude, data.drop.latitude]);
        any = true;
      }
      if (any) map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 0 });
    } catch {
      /* ignore */
    }
  }, [data, crumbs]);

  useEffect(() => {
    if (mapReadyRef.current && data) renderTrail();
  }, [data, renderTrail]);

  // ── Scrub → move rider marker + "covered" overlay ──────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || !hasTrail) return;
    const upto = crumbs
      .slice(0, idx + 1)
      .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude))
      .map((c) => [c.longitude, c.latitude] as [number, number]);
    const cur = crumbs[Math.min(idx, crumbs.length - 1)];
    if (map.getSource(DONE_SOURCE)) {
      map.getSource(DONE_SOURCE).setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: upto.length >= 2 ? upto : [] },
      });
    }
    if (cur && riderMarkerRef.current && Number.isFinite(cur.latitude) && Number.isFinite(cur.longitude)) {
      riderMarkerRef.current.setLngLat([cur.longitude, cur.latitude]);
    }
  }, [idx, crumbs, hasTrail]);

  // ── Play / pause ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      playTimerRef.current = null;
      return;
    }
    playTimerRef.current = setInterval(() => {
      setIdx((i) => {
        if (i >= crumbs.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 350);
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    };
  }, [playing, crumbs.length]);

  const cur = hasTrail ? crumbs[Math.min(idx, crumbs.length - 1)] : null;
  const avgSpeed = useMemo(() => {
    const vals = crumbs.map((c) => c.speedKmh).filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [crumbs]);

  if (!isOpen) return null;

  return (
    <OrderPageOverlay
      className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onBackdropClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-[calc(100vw-2rem)] max-w-6xl h-[min(90vh,calc(100dvh-2rem))] flex flex-col overflow-hidden text-[12px] text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 py-3 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-white">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-full bg-emerald-100 text-emerald-700">
              <i className="bi bi-geo-alt text-[14px]" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Rider Tracking</h2>
              <p className="text-[11px] text-slate-500">
                {orderIdText ?? ""}
                {riderName ? ` · ${riderName}` : ""} · minute-by-minute GPS trail
              </p>
            </div>
          </div>
          <button type="button" className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Stats */}
        <div className="shrink-0 grid grid-cols-2 sm:grid-cols-5 gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
          <Stat label="Distance covered" value={fmtDistance(data?.totalDistanceM)} />
          <Stat label="Duration" value={fmtDuration(data?.firstAt ?? null, data?.lastAt ?? null)} />
          <Stat label="GPS points" value={data ? String(data.pointCount) : "—"} />
          <Stat label="Avg speed" value={avgSpeed != null ? `${avgSpeed.toFixed(1)} km/h` : "—"} />
          <Stat label="Violations" value={data ? String(data.violations.length) : "—"} tone={data && data.violations.length > 0 ? "warn" : "default"} />
        </div>

        {/* Map */}
        <div className="relative min-h-0 flex-1">
          <div ref={containerRef} className="absolute inset-0" />
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] text-slate-500">
              Loading trail…
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-[12px] text-red-700">{error}</div>
            </div>
          ) : data && !hasTrail ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-[12px] text-slate-500">
                No GPS trail recorded for this order yet.
              </div>
            </div>
          ) : null}

          {/* Legend */}
          {hasTrail ? (
            <div className="absolute left-3 top-3 z-[5] rounded-md border border-gray-200 bg-white/95 px-2.5 py-2 text-[10px] shadow-sm">
              <LegendRow color="#2563eb" label="Pickup" />
              <LegendRow color="#059669" label="Drop" />
              <LegendRow color="#16a34a" label="Covered" line />
              <LegendRow color="#94a3b8" label="Full trail" line />
              {data!.violations.length > 0 ? <LegendRow color="#ef4444" label="Violation" /> : null}
            </div>
          ) : null}
        </div>

        {/* Timeline scrubber */}
        {hasTrail ? (
          <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                aria-label={playing ? "Pause" : "Play"}
              >
                <i className={`bi ${playing ? "bi-pause-fill" : "bi-play-fill"} text-[14px]`} />
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0, crumbs.length - 1)}
                value={idx}
                onChange={(e) => {
                  setPlaying(false);
                  setIdx(Number(e.target.value));
                }}
                className="flex-1 accent-emerald-600"
              />
              <span className="shrink-0 tabular-nums text-[11px] text-slate-500">
                {idx + 1}/{crumbs.length}
              </span>
            </div>
            {cur ? (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <Stat label="Time (IST)" value={fmtTime(cur.at)} />
                <Stat label="Covered so far" value={fmtDistance(cur.cumulativeDistanceM)} />
                <Stat label="Speed" value={cur.speedKmh != null ? `${cur.speedKmh.toFixed(1)} km/h` : "—"} />
                <Stat
                  label="Position"
                  value={`${cur.latitude.toFixed(5)}, ${cur.longitude.toFixed(5)}`}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Violations list */}
        {hasTrail && data!.violations.length > 0 ? (
          <div className="shrink-0 max-h-28 overflow-y-auto border-t border-gray-100 bg-gray-50/60 px-4 py-2">
            <div className="flex flex-col gap-1">
              {data!.violations.map((v) => {
                const meta = violationMeta(v.violationType);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      // Jump the scrubber to the breadcrumb nearest this violation's time.
                      if (!v.at) return;
                      const t = Date.parse(v.at);
                      let best = 0;
                      let bestDiff = Infinity;
                      crumbs.forEach((c, i) => {
                        const ct = c.at ? Date.parse(c.at) : NaN;
                        if (Number.isFinite(ct)) {
                          const d = Math.abs(ct - t);
                          if (d < bestDiff) {
                            bestDiff = d;
                            best = i;
                          }
                        }
                      });
                      setPlaying(false);
                      setIdx(best);
                    }}
                    className="flex items-center gap-2 rounded px-2 py-1 text-left text-[11px] hover:bg-white"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: meta.color }} />
                    <span className="font-medium text-slate-700">{meta.label}</span>
                    <span className="text-slate-400">L{v.level}</span>
                    <span className="truncate text-slate-500">{v.message ?? ""}</span>
                    <span className="ml-auto shrink-0 text-slate-400">{fmtTime(v.at)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-gray-50 px-5 py-2.5 text-[11px] text-gray-500">
          <span>
            <i className="bi bi-info-circle mr-1" />
            Drag the slider or press play to replay the rider&apos;s movement.
          </span>
          <button
            type="button"
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded-md text-[11px] font-medium cursor-pointer"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </OrderPageOverlay>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-[12px] font-semibold ${tone === "warn" ? "text-amber-600" : "text-slate-800"} orders-num`}>
        {value}
      </div>
    </div>
  );
}

function LegendRow({ color, label, line = false }: { color: string; label: string; line?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span
        className="shrink-0"
        style={
          line
            ? { width: 14, height: 3, borderRadius: 2, background: color }
            : { width: 9, height: 9, borderRadius: 999, background: color }
        }
      />
      <span className="text-slate-600">{label}</span>
    </div>
  );
}
