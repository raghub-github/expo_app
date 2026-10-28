"use client";

/**
 * Rider tracking map + timeline (historical breadcrumb replay).
 *
 * Replays every stored GPS fix for one order on Mapbox. An order can be held by
 * SEVERAL riders in turn (assign → cancel/unassign → reassign); each attempt is
 * its own tracking session and is kept forever, so the picker lets you replay
 * each rider separately, or view every attempt at once. Works for all services
 * (food / parcel / person ride) — the trail is keyed on the order id only.
 *
 * Accuracy: raw GPS fixes are snapped to the real road network via Mapbox Map
 * Matching, so the drawn path follows streets instead of cutting across blocks.
 * Snapping is best-effort — any failure falls back to the raw trail.
 *
 * Distinct from the live RiderRouteMap (current position + planned route).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { mapCache } from "@/lib/map-cache";
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

/** One rider assignment (tracking session) on this order. */
type RiderSegment = {
  key: string;
  attempt: number;
  sessionId: number | null;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  sessionStatus: string | null;
  stopReason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  firstAt: string | null;
  lastAt: string | null;
  distanceM: number;
  pointCount: number;
  startIndex: number;
  endIndex: number;
  violations: TrackViolation[];
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
  riders?: RiderSegment[];
  riderCount?: number;
  breadcrumbs: Breadcrumb[];
  violations: TrackViolation[];
};

type TimelineEvent = {
  event_type: string;
  occurred_at: string;
  merchant_distance_km?: number | null;
  customer_distance_km?: number | null;
  rider_latitude?: number | null;
  rider_longitude?: number | null;
  status_message?: string | null;
};

type RiderTimelinePayload = {
  assigned_at?: string | null;
  accepted_at?: string | null;
  reached_merchant_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  events?: TimelineEvent[];
};

/** Milestone pins on the map (like assignment log / 2nd-image tooltips). */
const MILESTONE_META: Record<string, { label: string; color: string; letter: string }> = {
  assigned: { label: "Assigned", color: "#64748b", letter: "A" },
  accepted: { label: "Accepted", color: "#2563eb", letter: "✓" },
  reached_merchant: { label: "Reached Mx", color: "#f59e0b", letter: "R" },
  picked_up: { label: "Picked Up", color: "#7c3aed", letter: "Pk" },
  delivered: { label: "Delivered", color: "#059669", letter: "Dv" },
};

const MILESTONE_ORDER = ["assigned", "accepted", "reached_merchant", "picked_up", "delivered"] as const;

function nearestCrumb(crumbs: Breadcrumb[], at: string | null | undefined): Breadcrumb | null {
  if (!at || !crumbs.length) return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  let best: Breadcrumb | null = null;
  let bestDiff = Infinity;
  for (const c of crumbs) {
    const ct = c.at ? Date.parse(c.at) : NaN;
    if (!Number.isFinite(ct)) continue;
    const d = Math.abs(ct - t);
    if (d < bestDiff) {
      bestDiff = d;
      best = c;
    }
  }
  return best;
}

function eventLngLat(
  ev: TimelineEvent,
  crumbs: Breadcrumb[]
): [number, number] | null {
  const lat = ev.rider_latitude != null ? Number(ev.rider_latitude) : NaN;
  const lng = ev.rider_longitude != null ? Number(ev.rider_longitude) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lng, lat];
  const c = nearestCrumb(crumbs, ev.occurred_at);
  if (c) return [c.longitude, c.latitude];
  return null;
}

const TRAIL_SOURCE = "gm-track-trail";
const TRAIL_LAYER = "gm-track-trail-line";
const TRAIL_CASING = "gm-track-trail-casing";
const DONE_SOURCE = "gm-track-done";
const DONE_LAYER = "gm-track-done-line";
const OTHERS_SOURCE = "gm-track-others";
const OTHERS_LAYER = "gm-track-others-line";

/** Per-attempt colours for the "all riders" overview. */
const ATTEMPT_COLORS = ["#2563eb", "#a855f7", "#f97316", "#0891b2", "#db2777", "#65a30d"];
const attemptColor = (i: number) => ATTEMPT_COLORS[i % ATTEMPT_COLORS.length];

const PLAY_STEP_MS = 420; // wall-clock per GPS fix at 1x
const SPEEDS = [1, 2, 4, 8] as const;

/** Mapbox vector streets — primary basemap when NEXT_PUBLIC_MAPBOX_TOKEN is set. */
const MAPBOX_STREETS_STYLE = "mapbox://styles/mapbox/streets-v12";

/**
 * Raster fallback when Mapbox styles/tiles are blocked. Carto hosts OSM-derived
 * tiles with maxzoom 19 — raw openstreetmap.org often fails (usage policy +
 * requests past z19 like …/22/…/….png → "Failed to fetch").
 */
const RASTER_FALLBACK_STYLE = {
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap © CARTO",
    },
  },
  layers: [{ id: "basemap", type: "raster", source: "basemap" }],
};

/** Ask the browser itself why Mapbox did not answer — the reply names the cause. */
async function probeMapbox(tk: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${encodeURIComponent(tk)}`,
      { cache: "no-store" }
    );
    return res.ok
      ? `api.mapbox.com answered HTTP ${res.status} but its tiles never rendered`
      : `api.mapbox.com rejected this token with HTTP ${res.status}`;
  } catch (e) {
    return `this browser cannot reach api.mapbox.com (${
      (e as Error)?.message ?? "network error"
    }) — an extension, tracking-prevention setting or network filter is blocking it`;
  }
}

type MapStage =
  | "idle"
  | "waiting-container"
  | "loading-lib"
  | "constructing"
  | "style-loading"
  | "zero-size"
  | "ready"
  | "failed";

const STAGE_TEXT: Record<MapStage, string> = {
  idle: "Starting…",
  "waiting-container": "Waiting for the map container to mount…",
  "loading-lib": "Loading the map library…",
  constructing: "Creating the map…",
  "style-loading": "Loading map tiles…",
  "zero-size": "Map area measured 0px — waiting for it to get a size…",
  ready: "Ready",
  failed: "Map failed",
};

/**
 * Read statically so Next inlines the value at build time. A computed or
 * optional-chained lookup (process.env?.X) is not guaranteed to be replaced
 * and silently yields undefined in the browser bundle.
 */
function token(): string | undefined {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN || undefined;
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

/** Human label for how a rider's attempt ended. */
function outcomeOf(seg: RiderSegment): { label: string; tone: "ok" | "bad" | "idle" } {
  const s = (seg.sessionStatus ?? "").toLowerCase();
  const r = (seg.stopReason ?? "").toLowerCase();
  if (r.includes("cancel") || s.includes("cancel")) return { label: "Cancelled", tone: "bad" };
  if (r.includes("unassign")) return { label: "Unassigned", tone: "bad" };
  if (s === "completed" || r.includes("deliver") || r.includes("complete"))
    return { label: "Completed", tone: "ok" };
  if (s === "active") return { label: "Active", tone: "ok" };
  if (s === "stopped") return { label: seg.stopReason ? seg.stopReason : "Stopped", tone: "idle" };
  return { label: seg.sessionStatus ?? "—", tone: "idle" };
}

const bearing = (a: [number, number], b: [number, number]) => {
  const toR = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toR(b[0] - a[0])) * Math.cos(toR(b[1]));
  const x =
    Math.cos(toR(a[1])) * Math.sin(toR(b[1])) -
    Math.sin(toR(a[1])) * Math.cos(toR(b[1])) * Math.cos(toR(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Snap a raw GPS trace to the road network (Mapbox Map Matching).
 * The API caps a request at 100 coordinates, so long traces are sent in
 * overlapping chunks and stitched. Returns the road line plus, for each input
 * fix, its matched on-road position (so the replay marker rides the street).
 */
async function snapToRoads(
  pts: Array<[number, number]>,
  tk: string,
  signal: AbortSignal
): Promise<{ line: Array<[number, number]>; matched: Array<[number, number] | null> } | null> {
  if (pts.length < 2) return null;
  const CHUNK = 100;
  const line: Array<[number, number]> = [];
  const matched: Array<[number, number] | null> = new Array(pts.length).fill(null);

  for (let start = 0; start < pts.length - 1; start += CHUNK - 1) {
    const slice = pts.slice(start, start + CHUNK);
    if (slice.length < 2) break;
    const coords = slice.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(";");
    const url =
      `https://api.mapbox.com/matching/v5/mapbox/driving/${coords}` +
      `?geometries=geojson&overview=full&tidy=true&access_token=${encodeURIComponent(tk)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      code?: string;
      matchings?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }>;
      tracepoints?: Array<{ location?: [number, number] } | null>;
    };
    if (body.code !== "Ok" || !body.matchings?.length) return null;

    const geo = body.matchings[0]?.geometry?.coordinates ?? [];
    // Drop the duplicated joint coordinate between consecutive chunks.
    line.push(...(line.length ? geo.slice(1) : geo));
    body.tracepoints?.forEach((tp, i) => {
      if (tp?.location) matched[start + i] = tp.location;
    });
  }
  return line.length >= 2 ? { line, matched } : null;
}

interface Props {
  isOpen: boolean;
  /** Formatted or canonical order id — the backend resolves either. */
  orderIdText: string | null | undefined;
  /** orders_core.id — used to load assignment timeline milestones. */
  orderCoreId?: number | null;
  riderName?: string | null;
  /** Preselect this rider's attempt (e.g. opened from that rider's log row). */
  initialRiderId?: number | null;
  onClose: () => void;
}

export default function RiderTrackingModal({
  isOpen,
  orderIdText,
  orderCoreId,
  riderName,
  initialRiderId,
  onClose,
}: Props) {
  const [data, setData] = useState<TrackPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<RiderTimelinePayload | null>(null);

  // Selected attempt: a rider `key`, or "all" for the overview.
  const [selectedKey, setSelectedKey] = useState<string>("all");
  const [pos, setPos] = useState(0); // float index into the active trail
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [follow, setFollow] = useState(true);
  const [snapOn, setSnapOn] = useState(true);
  const [snapState, setSnapState] = useState<"idle" | "loading" | "done" | "failed">("idle");
  const [snapped, setSnapped] = useState<Record<
    string,
    { line: Array<[number, number]>; matched: Array<[number, number] | null> } | null
  >>({});

  // Callback-ref + state so map init re-runs the instant the host is in the DOM
  // (portal overlays used to delay one frame and leave stage=waiting-container).
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    setContainer(node);
  }, []);
  const [mapReady, setMapReady] = useState(false);
  /** Bumped on every style.load so trail layers re-draw after Mapbox→OSM fallback (setStyle wipes layers). */
  const [styleEpoch, setStyleEpoch] = useState(0);
  /** Which init step the map reached — shown on screen when it never renders. */
  const [stage, setStage] = useState<MapStage>("idle");
  /** Expand whole modal (header + stats + map + logs). */
  const [fullscreen, setFullscreen] = useState(false);
  /** Map icon: pure map only — hide chrome so the map fills the page. */
  const [mapOnlyFullscreen, setMapOnlyFullscreen] = useState(false);
  const [riderMenuOpen, setRiderMenuOpen] = useState(false);

  const mapRef = useRef<any>(null);
  const mapboxRef = useRef<any>(null);
  const riderMarkerRef = useRef<any>(null);
  const riderElRef = useRef<HTMLDivElement | null>(null);
  const staticMarkersRef = useRef<any[]>([]);
  /** Start/End pins — only while the selected rider route is actively playing/at ends. */
  const tripEndMarkerRef = useRef<any>(null);
  const milestoneMarkersRef = useRef<any[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const allCrumbs = useMemo(() => data?.breadcrumbs ?? [], [data]);
  const segments = useMemo<RiderSegment[]>(() => {
    if (data?.riders?.length) return data.riders;
    // Back-compat: an older backend returns only a flat list — treat it as one attempt.
    if (!data || !allCrumbs.length) return [];
    return [
      {
        key: "all",
        attempt: 1,
        sessionId: null,
        riderId: allCrumbs[0]?.riderId ?? null,
        riderName: riderName ?? null,
        riderMobile: null,
        sessionStatus: null,
        stopReason: null,
        startedAt: data.firstAt,
        endedAt: data.lastAt,
        firstAt: data.firstAt,
        lastAt: data.lastAt,
        distanceM: data.totalDistanceM,
        pointCount: allCrumbs.length,
        startIndex: 0,
        endIndex: allCrumbs.length - 1,
        violations: data.violations ?? [],
      },
    ];
  }, [data, allCrumbs, riderName]);

  const withPoints = useMemo(() => segments.filter((s) => s.pointCount > 0), [segments]);
  const activeSeg = useMemo(
    () => (selectedKey === "all" ? null : segments.find((s) => s.key === selectedKey) ?? null),
    [segments, selectedKey]
  );

  /** Crumbs being replayed: one rider's slice, or the whole order in order. */
  const crumbs = useMemo(() => {
    if (!allCrumbs.length) return [];
    if (!activeSeg) {
      if (withPoints.length <= 1) return allCrumbs;
      // Overview replays the newest attempt (the one that actually ran).
      const last = withPoints[withPoints.length - 1];
      return allCrumbs.slice(last.startIndex, last.endIndex + 1);
    }
    if (activeSeg.startIndex < 0) return [];
    return allCrumbs.slice(activeSeg.startIndex, activeSeg.endIndex + 1);
  }, [allCrumbs, activeSeg, withPoints]);

  const hasTrail = crumbs.length > 0;
  const maxIdx = Math.max(0, crumbs.length - 1);
  const idx = Math.min(Math.round(pos), maxIdx);
  const cur = hasTrail ? crumbs[idx] : null;

  const activeViolations = useMemo(
    () => (activeSeg ? activeSeg.violations : data?.violations ?? []),
    [activeSeg, data]
  );

  const snapKey = activeSeg?.key ?? "__overview__";
  const activeSnap = snapOn ? snapped[snapKey] ?? null : null;

  /** Positions used for drawing/animation — snapped where available. */
  const drawPts = useMemo<Array<[number, number]>>(() => {
    const raw = crumbs
      .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude))
      .map((c) => [c.longitude, c.latitude] as [number, number]);
    if (!activeSnap) return raw;
    return raw.map((p, i) => activeSnap.matched[i] ?? p);
  }, [crumbs, activeSnap]);

  // ── Fetch trail on open ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !orderIdText) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setPos(0);
    setPlaying(false);
    setSelectedKey("all");
    setSnapped({});
    setTimeline(null);
    void (async () => {
      try {
        const load = () =>
          fetch(`/api/orders/${encodeURIComponent(orderIdText)}/track`, {
            credentials: "include",
            cache: "no-store",
            signal: ac.signal,
          });
        let res = await load();
        // Backend may still be starting — one quiet retry.
        if (!ac.signal.aborted && (res.status === 502 || res.status === 503)) {
          await new Promise((r) => setTimeout(r, 700));
          if (!ac.signal.aborted) res = await load();
        }
        if (ac.signal.aborted) return;
        const body = (await res.json().catch(() => ({}))) as TrackPayload & { error?: string };
        if (!res.ok) {
          setError(body.error || "Failed to load tracking data");
          setData(null);
          return;
        }
        setData(body);
      } catch (e) {
        if (!ac.signal.aborted && (e as Error).name !== "AbortError") {
          setError("Failed to load tracking data");
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [isOpen, orderIdText]);

  // Opened from a specific rider's activity-log row → focus that attempt.
  useEffect(() => {
    if (!segments.length) return;
    if (initialRiderId == null) return;
    const match = segments.find((s) => s.riderId === initialRiderId && s.pointCount > 0);
    if (match) setSelectedKey(match.key);
  }, [segments, initialRiderId]);

  // Single-rider orders: auto-select so that rider's route is the active replay.
  useEffect(() => {
    if (withPoints.length !== 1) return;
    if (selectedKey !== "all") return;
    setSelectedKey(withPoints[0].key);
  }, [withPoints, selectedKey]);

  // New rider selection → start of that trail.
  useEffect(() => {
    setPos(0);
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, crumbs.length]);

  // Assignment milestones (accept / reach / pickup / deliver) for the selected rider.
  useEffect(() => {
    if (!isOpen || !orderCoreId || !activeSeg?.riderId) {
      setTimeline(null);
      return;
    }
    const ac = new AbortController();
    void fetch(
      `/api/orders/${orderCoreId}/rider-timeline?rider_id=${activeSeg.riderId}`,
      { credentials: "include", cache: "no-store", signal: ac.signal }
    )
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as RiderTimelinePayload;
        if (ac.signal.aborted) return;
        setTimeline(res.ok ? body : null);
      })
      .catch(() => {
        if (!ac.signal.aborted) setTimeline(null);
      });
    return () => ac.abort();
  }, [isOpen, orderCoreId, activeSeg?.riderId]);

  // Recover the map host if the callback-ref missed the first paint.
  useLayoutEffect(() => {
    if (!isOpen) {
      setContainer(null);
      setFullscreen(false);
      setMapOnlyFullscreen(false);
      return;
    }
    if (container) return;
    const el = document.getElementById("gm-rider-tracking-map-host");
    if (el instanceof HTMLDivElement) setContainer(el);
  }, [isOpen, container]);

  // Fullscreen / map-only changes size — Mapbox needs an explicit resize.
  useEffect(() => {
    if (!isOpen || !mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const t = window.setTimeout(() => {
      try {
        map.resize();
        setStyleEpoch((n) => n + 1);
      } catch {
        /* ignore */
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [fullscreen, mapOnlyFullscreen, isOpen, mapReady]);

  // Esc exits map-only fullscreen first (so chrome comes back), then modal fullscreen.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mapOnlyFullscreen) {
        e.preventDefault();
        setMapOnlyFullscreen(false);
        return;
      }
      if (fullscreen) {
        e.preventDefault();
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, mapOnlyFullscreen, fullscreen]);

  const shellExpanded = fullscreen || mapOnlyFullscreen;

  // ── Map init — runs once the container is really in the DOM ────────────
  // Every step reports through `stage`. A blank white canvas with no
  // explanation was the original bug; now whatever fails says so on screen.
  useEffect(() => {
    if (!isOpen) return;
    if (!container) {
      setStage("waiting-container");
      const retry = window.setInterval(() => {
        const el = document.getElementById("gm-rider-tracking-map-host");
        if (el instanceof HTMLDivElement) {
          setContainer(el);
          window.clearInterval(retry);
        }
      }, 50);
      const stop = window.setTimeout(() => window.clearInterval(retry), 4000);
      return () => {
        window.clearInterval(retry);
        window.clearTimeout(stop);
      };
    }
    if (mapRef.current) return;

    const tk = token();
    if (!tk) {
      setStage("failed");
      setMapError(
        "No Mapbox token in this build — NEXT_PUBLIC_MAPBOX_TOKEN was empty when the dashboard image was built."
      );
      return;
    }
    // mapbox-gl needs WebGL; without it the constructor throws.
    let webgl = false;
    try {
      const probe = document.createElement("canvas");
      webgl = Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
    } catch {
      webgl = false;
    }
    if (!webgl) {
      setStage("failed");
      setMapError("WebGL is disabled in this browser/profile, so Mapbox cannot draw.");
      return;
    }

    let disposed = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    setStage("loading-lib");

    // This dashboard does NOT bundle mapbox-gl — every working map pulls it
    // from the CDN via mapCache (which also injects mapbox-gl.css). A bundled
    // `import("mapbox-gl")` here never resolved, which is why the canvas stayed
    // blank with no error. We reuse the loader but build our OWN Map rather
    // than mapCache.getOrCreateMap(), because that returns a cached singleton
    // bound to another container (RiderRouteMap lives on this same page).
    void mapCache
      .loadMapboxScript()
      .then(async () => {
        if (disposed || mapRef.current) return;
        const mapboxgl = (window as unknown as { mapboxgl?: any }).mapboxgl;
        if (!mapboxgl) throw new Error("window.mapboxgl missing after script load");
        mapboxRef.current = mapboxgl;
        mapboxgl.accessToken = tk;
        // Stops ERR_BLOCKED_BY_CLIENT noise from ad blockers on telemetry.
        try {
          const { disableMapboxTelemetry } = await import("@/lib/mapbox/disable-telemetry");
          disableMapboxTelemetry();
        } catch {
          /* non-fatal */
        }
        setStage("constructing");

        const rect = container.getBoundingClientRect();
        let map: any;
        let usingRasterFallback = false;
        try {
          // Prefer Mapbox streets (token is present). Raster fallback is only for
          // blocked Mapbox — never start on openstreetmap.org (z22 tile fetches fail).
          map = new mapboxgl.Map({
            container,
            style: MAPBOX_STREETS_STYLE,
            center: [77.209, 28.6139],
            zoom: 11,
            maxZoom: 18,
            attributionControl: false,
          });
        } catch (err) {
          setStage("failed");
          setMapError(`Map could not start: ${(err as Error)?.message ?? "unknown error"}`);
          return;
        }
        mapRef.current = map;
        try {
          map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        } catch {
          /* non-fatal */
        }

        map.on("error", (e: any) => {
          const msg = String(e?.error?.message || e?.error?.status || "Map failed to load");
          // Per-tile network blips (especially OSM z>19) must not replace the UI banner.
          if (/failed to fetch|ajaxerror|tile/i.test(msg)) {
            console.warn("[RiderTrackingModal] tile error", msg);
            return;
          }
          setMapError(msg);
          console.warn("[RiderTrackingModal] map error", msg);
        });
        // "style.load" matters too: after a fallback setStyle() the one-shot
        // "load" event may already have been missed, and without this the map
        // would render tiles while our layers were never drawn.
        const markReady = () => {
          if (disposed || mapRef.current !== map) return;
          if (watchdog) clearTimeout(watchdog);
          // Style swaps destroy GeoJSON layers — bump epoch so draw re-runs.
          map.resize();
          // Drop stale tile-fetch banners once the basemap is actually up.
          if (!usingRasterFallback) setMapError(null);
          setStage("ready");
          setMapReady(true);
          setStyleEpoch((n) => n + 1);
          // Modal flex layout often settles a frame after construct; resize again.
          requestAnimationFrame(() => {
            try {
              map.resize();
              setStyleEpoch((n) => n + 1);
            } catch {
              /* ignore */
            }
          });
        };
        map.on("load", markReady);
        map.on("style.load", markReady);

        setStage(rect.width < 2 || rect.height < 2 ? "zero-size" : "style-loading");

        const switchToRasterFallback = (reason: string) => {
          if (disposed || mapRef.current !== map || usingRasterFallback) return;
          usingRasterFallback = true;
          setMapError(`${reason} — using Carto basemap.`);
          try {
            map.setMaxZoom(18);
            map.setStyle(RASTER_FALLBACK_STYLE as any);
          } catch {
            setStage("failed");
            setMapError(reason);
          }
        };

        // If Mapbox style never loads, fall back to Carto raster (maxzoom 19).
        watchdog = setTimeout(() => {
          if (disposed || mapRef.current !== map) return;
          if (map.isStyleLoaded?.()) {
            markReady();
            return;
          }
          void probeMapbox(tk).then((diag) => {
            if (disposed || mapRef.current !== map || map.isStyleLoaded?.()) return;
            switchToRasterFallback(diag);
            watchdog = setTimeout(() => {
              if (disposed || mapRef.current !== map) return;
              if (!map.isStyleLoaded?.()) {
                setStage("failed");
                setMapError(
                  `${diag}. Raster fallback did not load either — check ad-block / network for mapbox.com and basemaps.cartocdn.com.`
                );
              }
            }, 8000);
          });
        }, 7000);
      })
      .catch((err) => {
        setStage("failed");
        setMapError(
          `Could not load the map library from api.mapbox.com: ${
            (err as Error)?.message ?? "script failed"
          }`
        );
      });

    return () => {
      disposed = true;
      if (watchdog) clearTimeout(watchdog);
      setMapReady(false);
      try {
        staticMarkersRef.current.forEach((m) => m.remove?.());
        staticMarkersRef.current = [];
        milestoneMarkersRef.current.forEach((m) => m.remove?.());
        milestoneMarkersRef.current = [];
        tripEndMarkerRef.current?.remove?.();
        tripEndMarkerRef.current = null;
        riderMarkerRef.current?.remove?.();
        riderMarkerRef.current = null;
        mapRef.current?.remove?.();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
    };
  }, [isOpen, container]);

  // Attach immediately, NOT gated on ready: a container that is zero-sized when
  // the map is built must still recover the instant it gets real size.
  useEffect(() => {
    if (!container) return;
    const ro = new ResizeObserver(() => mapRef.current?.resize?.());
    ro.observe(container);
    return () => ro.disconnect();
  }, [container]);

  // ── Road snapping (best effort, cached per attempt) ────────────────────
  useEffect(() => {
    if (!snapOn || !hasTrail) return;
    if (snapped[snapKey] !== undefined) return;
    const tk = token();
    if (!tk) return;
    const raw = crumbs
      .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude))
      .map((c) => [c.longitude, c.latitude] as [number, number]);
    if (raw.length < 2) return;
    const ac = new AbortController();
    setSnapState("loading");
    void snapToRoads(raw, tk, ac.signal)
      .then((r) => {
        if (ac.signal.aborted) return;
        setSnapped((prev) => ({ ...prev, [snapKey]: r }));
        setSnapState(r ? "done" : "failed");
      })
      .catch(() => {
        if (!ac.signal.aborted) {
          setSnapped((prev) => ({ ...prev, [snapKey]: null }));
          setSnapState("failed");
        }
      });
    return () => ac.abort();
  }, [snapOn, snapKey, hasTrail, crumbs, snapped]);

  // ── Draw trail + pins + violations ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl || !mapReady || !data) return;
    // After setStyle() sources/layers are gone and isStyleLoaded may briefly be false.
    // Always attach a timeout retry — if style.load already fired, once() never runs.
    if (typeof map.isStyleLoaded === "function" && !map.isStyleLoaded()) {
      const onStyle = () => setStyleEpoch((n) => n + 1);
      map.once("style.load", onStyle);
      const retry = window.setTimeout(() => setStyleEpoch((n) => n + 1), 250);
      return () => {
        window.clearTimeout(retry);
        try {
          map.off("style.load", onStyle);
        } catch {
          /* ignore */
        }
      };
    }

    const cleanLine = (coords: Array<[number, number]>) =>
      coords.filter(
        (p) =>
          Array.isArray(p) &&
          p.length >= 2 &&
          Number.isFinite(p[0]) &&
          Number.isFinite(p[1]) &&
          Math.abs(p[0]) <= 180 &&
          Math.abs(p[1]) <= 90
      );

    const fc = (coords: Array<[number, number]>) => ({
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: coords.length >= 2 ? coords : [],
      },
    });

    const snappedLine = activeSnap?.line?.length ? cleanLine(activeSnap.line) : [];
    const mainLine = snappedLine.length >= 2 ? snappedLine : cleanLine(drawPts);

    // Other attempts (dimmed) when viewing the overview.
    const otherFeatures =
      !activeSeg && withPoints.length > 1
        ? withPoints.slice(0, -1).map((s, i) => ({
            type: "Feature" as const,
            properties: { color: attemptColor(i) },
            geometry: {
              type: "LineString" as const,
              coordinates: allCrumbs
                .slice(s.startIndex, s.endIndex + 1)
                .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude))
                .map((c) => [c.longitude, c.latitude] as [number, number]),
            },
          }))
        : [];

    if (!map.getSource(OTHERS_SOURCE)) {
      map.addSource(OTHERS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: otherFeatures },
      });
      map.addLayer({
        id: OTHERS_LAYER,
        type: "line",
        source: OTHERS_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3,
          "line-opacity": 0.55,
          "line-dasharray": [2, 1.5],
        },
      });
    } else {
      map.getSource(OTHERS_SOURCE).setData({ type: "FeatureCollection", features: otherFeatures });
    }

    const ensureLineLayer = (
      sourceId: string,
      layerId: string,
      casingId: string | null,
      data: ReturnType<typeof fc>,
      color: string,
      width: number
    ) => {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: "geojson", data });
      } else {
        map.getSource(sourceId).setData(data);
      }
      if (casingId && !map.getLayer(casingId)) {
        map.addLayer({
          id: casingId,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#ffffff", "line-width": width + 3, "line-opacity": 0.95 },
        });
      }
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": color, "line-width": width, "line-opacity": 1 },
        });
      }
      // Keep route above basemap labels when style reloads.
      try {
        if (casingId && map.getLayer(casingId)) map.moveLayer(casingId);
        if (map.getLayer(layerId)) map.moveLayer(layerId);
      } catch {
        /* ignore */
      }
    };

    ensureLineLayer(TRAIL_SOURCE, TRAIL_LAYER, TRAIL_CASING, fc(mainLine), "#64748b", 5);
    // Covered overlay is driven by the scrub effect — create once, don't wipe it here.
    if (!map.getSource(DONE_SOURCE)) {
      map.addSource(DONE_SOURCE, { type: "geojson", data: fc([]) });
    }
    if (!map.getLayer(DONE_LAYER)) {
      map.addLayer({
        id: DONE_LAYER,
        type: "line",
        source: DONE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#16a34a", "line-width": 6, "line-opacity": 1 },
      });
    }
    try {
      if (map.getLayer(DONE_LAYER)) map.moveLayer(DONE_LAYER);
    } catch {
      /* ignore */
    }

    // Static markers (pickup / drop / violations) — rebuilt per selection.
    staticMarkersRef.current.forEach((m) => m.remove?.());
    staticMarkersRef.current = [];
    const addPin = (lng: number, lat: number, html: string) => {
      const wrap = document.createElement("div");
      wrap.innerHTML = html;
      const el = wrap.firstElementChild as HTMLElement | null;
      if (!el) return;
      staticMarkersRef.current.push(
        new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map)
      );
    };
    const pinHtml = (bg: string, letter: string, title: string) =>
      `<div title="${title}" style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${bg};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);color:#fff;font-size:11px;font-weight:700;">${letter}</span></div>`;
    const dotHtml = (bg: string, title: string) =>
      `<div title="${title}" style="width:14px;height:14px;border-radius:50%;background:${bg};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);"></div>`;

    if (data.pickup) addPin(data.pickup.longitude, data.pickup.latitude, pinHtml("#2563eb", "P", "Pickup"));
    if (data.drop) addPin(data.drop.longitude, data.drop.latitude, pinHtml("#059669", "D", "Drop"));

    for (const v of activeViolations) {
      if (v.latitude == null || v.longitude == null) continue;
      const meta = violationMeta(v.violationType);
      addPin(v.longitude, v.latitude, dotHtml(meta.color, `${meta.label} · L${v.level} · ${v.message ?? ""}`));
    }

    // Rider marker — an arrow that rotates to the direction of travel.
    riderMarkerRef.current?.remove?.();
    riderMarkerRef.current = null;
    if (mainLine.length) {
      const el = document.createElement("div");
      el.style.cssText = "width:26px;height:26px;display:flex;align-items:center;justify-content:center;";
      el.innerHTML =
        `<div style="width:26px;height:26px;border-radius:50%;background:#111827;border:3px solid #fff;box-shadow:0 0 0 4px rgba(17,24,39,.2);display:flex;align-items:center;justify-content:center;">` +
        `<svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l7 19-7-5-7 5z"/></svg></div>`;
      riderElRef.current = el.firstElementChild as HTMLDivElement;
      riderMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(mainLine[0])
        .addTo(map);
    }

    // Fit to whatever is on screen.
    try {
      const bounds = new mapboxgl.LngLatBounds();
      let any = false;
      for (const p of mainLine) {
        bounds.extend(p);
        any = true;
      }
      for (const f of otherFeatures) {
        for (const p of f.geometry.coordinates) {
          bounds.extend(p as [number, number]);
          any = true;
        }
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
  }, [mapReady, styleEpoch, data, drawPts, activeSnap, activeSeg, withPoints, allCrumbs, activeViolations]);

  // Assignment timeline pins (Accept / Reach / Pickup / Deliver) — separate from trail draw
  // so a popup/marker failure never blocks the GPS route line.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    const clear = () => {
      milestoneMarkersRef.current.forEach((m) => {
        try {
          m.remove?.();
        } catch {
          /* ignore */
        }
      });
      milestoneMarkersRef.current = [];
    };
    if (!map || !mapboxgl || !mapReady || !activeSeg || !crumbs.length || !timeline) {
      clear();
      return;
    }

    clear();
    const byType = new Map<string, TimelineEvent>();
    for (const ev of timeline.events ?? []) {
      if (ev?.event_type && ev.occurred_at) byType.set(ev.event_type, ev);
    }
    const ensure = (type: string, at: string | null | undefined) => {
      if (!at || byType.has(type)) return;
      byType.set(type, { event_type: type, occurred_at: at });
    };
    ensure("assigned", timeline.assigned_at);
    ensure("accepted", timeline.accepted_at);
    ensure("reached_merchant", timeline.reached_merchant_at);
    ensure("picked_up", timeline.picked_up_at);
    ensure("delivered", timeline.delivered_at);

    for (const type of MILESTONE_ORDER) {
      const ev = byType.get(type);
      if (!ev) continue;
      const meta = MILESTONE_META[type];
      if (!meta) continue;
      const ll = eventLngLat(ev, crumbs);
      if (!ll) continue;
      try {
        const wrap = document.createElement("div");
        wrap.innerHTML =
          `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">` +
          `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${meta.color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">` +
          `<span style="transform:rotate(45deg);color:#fff;font-size:10px;font-weight:800;line-height:1;">${meta.letter}</span></div>` +
          `<div style="margin-top:4px;padding:1px 5px;border-radius:4px;background:${meta.color};color:#fff;font-size:9px;font-weight:700;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3);">${meta.label}</div>` +
          `</div>`;
        const el = wrap.firstElementChild as HTMLElement | null;
        if (!el) continue;
        const popup = new mapboxgl.Popup({ offset: 18, closeButton: true, maxWidth: "240px" }).setHTML(
          `<div style="font:600 12px/1.35 system-ui,sans-serif;color:#0f172a;">${meta.label}</div>` +
            `<div style="font:500 11px/1.35 system-ui,sans-serif;color:#334155;margin-top:2px;">${fmtTime(ev.occurred_at)}</div>`
        );
        milestoneMarkersRef.current.push(
          new mapboxgl.Marker({ element: el, anchor: "bottom" })
            .setLngLat(ll)
            .setPopup(popup)
            .addTo(map)
        );
      } catch {
        /* ignore one bad milestone */
      }
    }

    return clear;
  }, [mapReady, styleEpoch, activeSeg, crumbs, timeline]);

  // START / END only on a selected rider's trail — never both at once, never on "all".
  // Start at scrub start; End only when replay reaches the trail end; mid-route neither.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    const clear = () => {
      try {
        tripEndMarkerRef.current?.remove?.();
      } catch {
        /* ignore */
      }
      tripEndMarkerRef.current = null;
    };
    if (!map || !mapboxgl || !mapReady || !activeSeg || !drawPts.length) {
      clear();
      return;
    }

    const atEnd = maxIdx > 0 ? pos >= maxIdx - 0.001 : false;
    const atStart = !atEnd && pos <= 0.05;
    const showEnd = atEnd && drawPts.length >= 2;
    const showStart = atStart || (maxIdx === 0 && pos <= 0.05);

    clear();
    if (!showStart && !showEnd) return;

    const tripLabel = (bg: string, letter: string, caption: string, title: string) => {
      const wrap = document.createElement("div");
      wrap.innerHTML =
        `<div title="${title}" style="display:flex;flex-direction:column;align-items:center;">` +
        `<div style="width:28px;height:28px;border-radius:50%;background:${bg};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800;">${letter}</div>` +
        `<div style="margin-top:3px;padding:1px 5px;border-radius:4px;background:${bg};color:#fff;font-size:9px;font-weight:700;white-space:nowrap;">${caption}</div>` +
        `</div>`;
      return wrap.firstElementChild as HTMLElement;
    };

    if (showEnd) {
      const [lng, lat] = drawPts[drawPts.length - 1];
      const el = tripLabel("#dc2626", "E", "END", "Rider ended here (last GPS)");
      tripEndMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([lng, lat])
        .addTo(map);
    } else if (showStart) {
      const [lng, lat] = drawPts[0];
      const el = tripLabel("#0d9488", "S", "START", "Rider started here (first GPS)");
      tripEndMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([lng, lat])
        .addTo(map);
    }

    return clear;
  }, [pos, drawPts, mapReady, maxIdx, activeSeg]);

  // ── Scrub → move marker + grow the "covered" overlay ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !drawPts.length) return;

    const i = Math.min(Math.floor(pos), drawPts.length - 1);
    const frac = Math.min(1, Math.max(0, pos - i));
    const a = drawPts[i];
    const b = drawPts[Math.min(i + 1, drawPts.length - 1)];
    const here: [number, number] = [lerp(a[0], b[0], frac), lerp(a[1], b[1], frac)];

    if (map.getSource(DONE_SOURCE)) {
      const covered = drawPts.slice(0, i + 1);
      if (frac > 0) covered.push(here);
      map.getSource(DONE_SOURCE).setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: covered.length >= 2 ? covered : [] },
      });
    }
    if (riderMarkerRef.current) {
      riderMarkerRef.current.setLngLat(here);
      if (riderElRef.current && (a[0] !== b[0] || a[1] !== b[1])) {
        riderElRef.current.style.transform = `rotate(${bearing(a, b)}deg)`;
      }
    }
    if (follow && playing) map.easeTo({ center: here, duration: 180 });
  }, [pos, drawPts, mapReady, follow, playing]);

  // ── Playback (requestAnimationFrame → smooth, not a stepping interval) ──
  useEffect(() => {
    if (!playing || maxIdx <= 0) return;
    lastTsRef.current = null;
    const tick = (ts: number) => {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      const dt = last == null ? 0 : ts - last;
      setPos((p) => {
        const next = p + (dt / PLAY_STEP_MS) * speed;
        if (next >= maxIdx) {
          setPlaying(false);
          return maxIdx;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, speed, maxIdx]);

  const avgSpeed = useMemo(() => {
    const vals = crumbs.map((c) => c.speedKmh).filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [crumbs]);

  const shownDistance = activeSeg ? activeSeg.distanceM : data?.totalDistanceM;
  const shownFirst = activeSeg ? activeSeg.firstAt : data?.firstAt ?? null;
  const shownLast = activeSeg ? activeSeg.lastAt : data?.lastAt ?? null;

  const jumpToViolation = useCallback(
    (v: TrackViolation) => {
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
      setPos(best);
    },
    [crumbs]
  );

  if (!isOpen) return null;

  return (
    <OrderPageOverlay
      className={`fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center ${
        shellExpanded ? "p-0" : "p-4"
      }`}
      onBackdropClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex flex-col overflow-hidden text-[12px] text-slate-800 ${
          mapOnlyFullscreen
            ? "h-[100dvh] w-[100vw] max-w-none rounded-none bg-transparent shadow-none"
            : shellExpanded
              ? "h-[100dvh] w-[100vw] max-w-none rounded-none bg-white shadow-lg"
              : "h-[min(92vh,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-6xl rounded-lg bg-white shadow-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — hidden in map-only fullscreen */}
        {!mapOnlyFullscreen ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-white px-4 py-2.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded-full bg-emerald-100 p-1.5 text-emerald-700">
                <i className="bi bi-geo-alt text-[14px]" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900">Rider Tracking</h2>
                <p className="truncate text-[11px] text-slate-500">
                  {orderIdText ?? ""}
                  {data?.serviceType ? ` · ${String(data.serviceType).replace(/_/g, " ")}` : ""}
                  {segments.length > 1 ? ` · ${segments.length} rider attempts` : ""} · minute-by-minute GPS trail
                </p>
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {hasTrail ? (
                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-emerald-100 bg-white/90 px-2.5 py-1"
                  aria-label="Map legend"
                >
                  <LegendRow color="#2563eb" label="Pickup" inline />
                  <LegendRow color="#059669" label="Drop" inline />
                  <LegendRow color="#0d9488" label="Start" inline />
                  <LegendRow color="#dc2626" label="End" inline />
                  <LegendRow color="#2563eb" label="Accepted" inline />
                  <LegendRow color="#f59e0b" label="Reached Mx" inline />
                  <LegendRow color="#7c3aed" label="Picked Up" inline />
                  <LegendRow color="#059669" label="Delivered" inline />
                  <LegendRow color="#16a34a" label="Covered" line inline />
                  <LegendRow color="#94a3b8" label="Full trail" line inline />
                  {!activeSeg && withPoints.length > 1 ? (
                    <LegendRow color="#a855f7" label="Earlier attempts" line inline />
                  ) : null}
                  {activeViolations.length > 0 ? (
                    <LegendRow color="#ef4444" label="Violation" inline />
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setMapOnlyFullscreen(false);
                  setFullscreen((v) => !v);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-gray-50"
                title={fullscreen ? "Exit full screen" : "Full screen — expand map & logs"}
                aria-pressed={fullscreen}
              >
                <i className={`bi ${fullscreen ? "bi-fullscreen-exit" : "bi-arrows-fullscreen"} text-[12px]`} />
                {fullscreen ? "Exit full screen" : "Full screen"}
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-gray-100 hover:text-slate-700"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>
        ) : null}

        {/* Rider picker — hidden in map-only fullscreen */}
        {!mapOnlyFullscreen && segments.length > 0 ? (
          <div className="shrink-0 flex items-center gap-2 overflow-x-auto border-b border-gray-100 bg-white px-4 py-2">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Rider</span>
            {segments.length > 1 ? (
              <button
                type="button"
                onClick={() => setSelectedKey("all")}
                className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                  selectedKey === "all"
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-gray-300 bg-white text-slate-600 hover:border-emerald-400"
                }`}
              >
                All attempts
              </button>
            ) : null}
            {segments.map((s, i) => {
              const o = outcomeOf(s);
              const active = selectedKey === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() =>
                    // Toggle: click again to unselect → overview ("all").
                    setSelectedKey((prev) => (prev === s.key ? "all" : s.key))
                  }
                  disabled={s.pointCount === 0}
                  title={
                    s.pointCount === 0
                      ? "No GPS recorded for this attempt"
                      : active
                        ? "Click again to unselect"
                        : undefined
                  }
                  className={`shrink-0 rounded-full border px-3 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-gray-300 bg-white text-slate-600 hover:border-emerald-400"
                  }`}
                >
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ background: active ? "#fff" : attemptColor(i) }}
                  />
                  <span className="font-medium">#{s.attempt} {s.riderName ?? `Rider ${s.riderId ?? "?"}`}</span>
                  <span className={active ? "ml-1.5 text-emerald-100" : `ml-1.5 ${o.tone === "bad" ? "text-red-500" : o.tone === "ok" ? "text-emerald-600" : "text-slate-400"}`}>
                    {o.label}
                  </span>
                  <span className={active ? "ml-1.5 text-emerald-100" : "ml-1.5 text-slate-400"}>
                    {s.pointCount === 0 ? "no GPS" : fmtDistance(s.distanceM)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Stats — hidden in map-only fullscreen */}
        {!mapOnlyFullscreen ? (
          <div className="shrink-0 grid grid-cols-2 sm:grid-cols-5 gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
            <Stat label="Distance covered" value={fmtDistance(shownDistance)} />
            <Stat label="Duration" value={fmtDuration(shownFirst, shownLast)} />
            <Stat label="GPS points" value={hasTrail ? String(crumbs.length) : "—"} />
            <Stat label="Avg speed" value={avgSpeed != null ? `${avgSpeed.toFixed(1)} km/h` : "—"} />
            <Stat
              label="Violations"
              value={String(activeViolations.length)}
              tone={activeViolations.length > 0 ? "warn" : "default"}
            />
          </div>
        ) : null}

        {/* Map — map icon: fixed full viewport, no chrome */}
        <div
          className={
            mapOnlyFullscreen
              ? "fixed inset-0 z-[210] bg-[#eef2f6]"
              : "relative min-h-[280px] flex-1 bg-[#eef2f6]"
          }
        >
          <div
            id="gm-rider-tracking-map-host"
            ref={setContainerRef}
            className="absolute inset-0 h-full w-full [&_.mapboxgl-canvas]:!h-full [&_.mapboxgl-canvas]:!w-full [&_.mapboxgl-canvas-container]:!h-full [&_.mapboxgl-canvas-container]:!w-full"
          />

          {loading ? (
            <div className="absolute inset-0 z-[6] flex items-center justify-center bg-white/70 text-[12px] text-slate-500">
              Loading trail…
            </div>
          ) : error ? (
            <div className="absolute inset-0 z-[6] flex items-center justify-center p-6 text-center">
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-[12px] text-red-700">{error}</div>
            </div>
          ) : data && !hasTrail ? (
            <div className="absolute inset-0 z-[6] flex items-center justify-center p-6 text-center">
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-[12px] text-slate-500">
                {activeSeg
                  ? "This rider recorded no GPS fixes for this order."
                  : "No GPS trail recorded for this order yet."}
              </div>
            </div>
          ) : null}

          {/* Map failures must never be a silent blank canvas: while the map is
              not ready we say which step it is on, and why it stopped. */}
          {!loading && !error && stage !== "ready" ? (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[7] flex -translate-y-1/2 justify-center px-6">
              <div
                className={`pointer-events-auto max-w-md rounded-lg border px-4 py-3 text-center text-[11px] shadow-sm ${
                  stage === "failed"
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-gray-200 bg-white/95 text-slate-600"
                }`}
              >
                <div className="font-semibold">{STAGE_TEXT[stage]}</div>
                {mapError ? <div className="mt-1 leading-snug">{mapError}</div> : null}
                <div className="mt-1.5 text-[10px] text-slate-400">
                  token {token() ? `present (${String(token()).length} chars)` : "MISSING"} · stage “{stage}”
                </div>
              </div>
            </div>
          ) : null}

          {/* Map works, but not on the intended basemap — say so quietly. */}
          {stage === "ready" && mapError ? (
            <div className="absolute left-1/2 top-3 z-[7] max-w-md -translate-x-1/2 rounded-md border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-center text-[10px] leading-snug text-amber-800 shadow-sm">
              {mapError}
            </div>
          ) : null}

          {/* Map-only fullscreen — under Mapbox +/- ; hides stats/logs/header */}
          <button
            type="button"
            onClick={() => {
              setMapOnlyFullscreen((v) => {
                const next = !v;
                if (next) setFullscreen(false);
                else setRiderMenuOpen(false);
                return next;
              });
            }}
            className="absolute right-2.5 top-[78px] z-[5] flex h-[29px] w-[29px] items-center justify-center rounded-md border border-gray-200 bg-white text-slate-700 shadow-sm hover:bg-gray-50"
            title={mapOnlyFullscreen ? "Exit map full screen" : "Full screen map only"}
            aria-label={mapOnlyFullscreen ? "Exit map full screen" : "Full screen map only"}
            aria-pressed={mapOnlyFullscreen}
          >
            <i className={`bi ${mapOnlyFullscreen ? "bi-fullscreen-exit" : "bi-arrows-fullscreen"} text-[12px]`} />
          </button>

          {/* Map options — sit above the map-FS control bar when present */}
          {hasTrail ? (
            <div
              className={`absolute right-3 z-[5] flex flex-col gap-1 rounded-md border border-gray-200 bg-white/95 px-2.5 py-2 text-[10px] shadow-sm ${
                mapOnlyFullscreen ? "bottom-14" : "bottom-3"
              }`}
            >
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} />
                <span>
                  Snap to roads
                  {snapOn && snapState === "loading" ? " …" : ""}
                  {snapOn && snapState === "failed" ? " (raw)" : ""}
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                <span>Follow rider</span>
              </label>
            </div>
          ) : null}

          {/* Map-only fullscreen: one compact row — 70% play controls, 30% rider */}
          {mapOnlyFullscreen && hasTrail ? (
            <div className="absolute inset-x-0 bottom-0 z-[8] border-t border-white/15 bg-slate-900/92 px-2.5 py-1.5 text-white backdrop-blur-sm sm:px-3">
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 basis-[70%] items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!playing && pos >= maxIdx) setPos(0);
                      setPlaying((p) => !p);
                    }}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
                    aria-label={playing ? "Pause" : "Play"}
                  >
                    <i className={`bi ${playing ? "bi-pause-fill" : "bi-play-fill"} text-[13px]`} />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={maxIdx}
                    step="any"
                    value={pos}
                    onChange={(e) => {
                      setPlaying(false);
                      setPos(Number(e.target.value));
                    }}
                    className="min-w-0 flex-1 accent-emerald-500"
                  />
                  <div className="flex shrink-0 items-center gap-0.5">
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSpeed(s)}
                        className={`rounded px-1 py-0.5 text-[9px] font-semibold transition ${
                          speed === s ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-200 hover:bg-slate-600"
                        }`}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                  <span className="hidden shrink-0 tabular-nums text-[10px] text-slate-400 sm:inline">
                    {idx + 1}/{crumbs.length}
                  </span>
                </div>
                <div className="relative flex min-w-0 basis-[30%] items-center gap-1.5">
                  <span className="hidden shrink-0 text-[9px] font-semibold uppercase tracking-wide text-slate-400 sm:inline">
                    Rider
                  </span>
                  {(() => {
                    const curSeg =
                      selectedKey === "all"
                        ? null
                        : segments.find((s) => s.key === selectedKey) ?? null;
                    const label = curSeg
                      ? `#${curSeg.attempt} ${curSeg.riderName ?? `Rider ${curSeg.riderId ?? "?"}`} · ${outcomeOf(curSeg).label}`
                      : segments.length > 1
                        ? "All attempts"
                        : segments[0]
                          ? `#${segments[0].attempt} ${segments[0].riderName ?? "Rider"}`
                          : "Select rider";
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => setRiderMenuOpen((o) => !o)}
                          className="flex h-7 min-w-0 w-full items-center justify-between gap-1 rounded border border-slate-500 bg-slate-800 px-2 text-left text-[11px] font-medium text-white hover:border-emerald-500"
                          aria-label="Change rider"
                          aria-expanded={riderMenuOpen}
                        >
                          <span className="min-w-0 truncate text-white">{label}</span>
                          <i className="bi bi-chevron-down shrink-0 text-[10px] text-white" />
                        </button>
                        {riderMenuOpen ? (
                          <div className="absolute bottom-full right-0 z-20 mb-1 max-h-48 w-full min-w-[12rem] overflow-y-auto rounded-md border border-slate-600 bg-slate-800 py-1 shadow-lg">
                            {segments.length > 1 ? (
                              <button
                                type="button"
                                className={`block w-full truncate px-2.5 py-1.5 text-left text-[11px] text-white hover:bg-slate-700 ${
                                  selectedKey === "all" ? "bg-emerald-700/40" : ""
                                }`}
                                onClick={() => {
                                  setPlaying(false);
                                  setSelectedKey("all");
                                  setRiderMenuOpen(false);
                                }}
                              >
                                All attempts
                              </button>
                            ) : null}
                            {segments.map((s) => {
                              const o = outcomeOf(s);
                              const name = s.riderName ?? `Rider ${s.riderId ?? "?"}`;
                              return (
                                <button
                                  key={s.key}
                                  type="button"
                                  disabled={s.pointCount === 0}
                                  className={`block w-full truncate px-2.5 py-1.5 text-left text-[11px] text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 ${
                                    selectedKey === s.key ? "bg-emerald-700/40" : ""
                                  }`}
                                  onClick={() => {
                                    setPlaying(false);
                                    setSelectedKey(s.key);
                                    setRiderMenuOpen(false);
                                  }}
                                >
                                  #{s.attempt} {name} · {o.label}
                                  {s.pointCount === 0 ? " · no GPS" : ` · ${fmtDistance(s.distanceM)}`}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Timeline / violations / footer — hidden when map fills the page */}
        {!mapOnlyFullscreen ? (
          <>
            {hasTrail ? (
              <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!playing && pos >= maxIdx) setPos(0); // replay from start
                      setPlaying((p) => !p);
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                    aria-label={playing ? "Pause" : "Play"}
                  >
                    <i className={`bi ${playing ? "bi-pause-fill" : "bi-play-fill"} text-[14px]`} />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={maxIdx}
                    step="any"
                    value={pos}
                    onChange={(e) => {
                      setPlaying(false);
                      setPos(Number(e.target.value));
                    }}
                    className="min-w-0 flex-1 accent-emerald-600"
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSpeed(s)}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                          speed === s ? "bg-emerald-600 text-white" : "bg-gray-100 text-slate-600 hover:bg-gray-200"
                        }`}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                  <span className="shrink-0 tabular-nums text-[11px] text-slate-500">
                    {idx + 1}/{crumbs.length}
                  </span>
                </div>
                {cur ? (
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <Stat label="Time (IST)" value={fmtTime(cur.at)} />
                    <Stat label="Covered so far" value={fmtDistance(cur.cumulativeDistanceM)} />
                    <Stat label="Speed" value={cur.speedKmh != null ? `${cur.speedKmh.toFixed(1)} km/h` : "—"} />
                    <Stat label="Position" value={`${cur.latitude.toFixed(5)}, ${cur.longitude.toFixed(5)}`} />
                  </div>
                ) : null}
              </div>
            ) : null}

            {hasTrail && activeViolations.length > 0 ? (
              <div className="shrink-0 max-h-28 overflow-y-auto border-t border-gray-100 bg-gray-50/60 px-4 py-2">
                <div className="flex flex-col gap-1">
                  {activeViolations.map((v) => {
                    const meta = violationMeta(v.violationType);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => jumpToViolation(v)}
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
                {segments.length > 1
                  ? "Pick a rider above to replay that attempt, or drag the slider / press play."
                  : "Drag the slider or press play to replay the rider's movement."}
              </span>
              <button
                type="button"
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded-md text-[11px] font-medium cursor-pointer"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </>
        ) : null}
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

function LegendRow({
  color,
  label,
  line = false,
  inline = false,
}: {
  color: string;
  label: string;
  line?: boolean;
  inline?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${inline ? "" : "py-0.5"}`}>
      <span
        className="shrink-0"
        style={
          line
            ? { width: 14, height: 3, borderRadius: 2, background: color }
            : { width: 9, height: 9, borderRadius: 999, background: color }
        }
      />
      <span className="whitespace-nowrap text-[10px] font-medium text-slate-600">{label}</span>
    </div>
  );
}
