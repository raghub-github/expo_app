"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitBranch } from "lucide-react";
import { mapCache } from "@/lib/map-cache";
import RouteDirectionsSheet, {
  parseMapboxRouteSheet,
  type RouteSheetData,
} from "./RouteDirectionsSheet";
import type { OrderRiderTrackingPayload } from "@/lib/db/operations/order-rider-tracking";
import {
  bearingDegreesLngLat,
  resolveRiderFrontWheelLngLat,
} from "@/lib/map-rider-route-anchor";
import {
  isValidLatLon,
  resolveStoreMapLngLat,
  toMapLngLat,
} from "@/lib/orders/parse-order-map-coords";

interface RiderRouteMapProps {
  orderId: number;
  riderId?: number | null;
  riderName?: string | null;
  storeName?: string | null;
  customerName?: string | null;
  dropAddressFallback?: string | null;
  /** Merchant store coordinates from DB — used for store pin + route (not address geocoding). */
  merchantStoreLat?: number | null;
  merchantStoreLon?: number | null;
  pickupAddressGeocoded?: string | null;
  orderStatus?: string | null;
  pickedUpAt?: string | null;
  pickupLat: number | null | undefined;
  pickupLon: number | null | undefined;
  dropLat: number | null | undefined;
  dropLon: number | null | undefined;
  initialTracking?: OrderRiderTrackingPayload | null;
  className?: string;
}

const RIDER_MAP_BIKE_SRC = "/mapbike.png";

type RouteEndpoints = {
  from: [number, number];
  to: [number, number];
  mode: "live" | "planned";
};

/** Rider app writes live location every ~3–5s; poll faster for visible movement. */
const POLL_MS = 2_000;
const ROUTE_SOURCE_ID = "active-route";
const ROUTE_CASING_LAYER_ID = "active-route-casing";
const ROUTE_LAYER_ID = "active-route-line";
const DELIVERY_ROUTE_SOURCE_ID = "delivery-leg-route";
const DELIVERY_ROUTE_CASING_LAYER_ID = "delivery-leg-route-casing";
const DELIVERY_ROUTE_LAYER_ID = "delivery-leg-route-line";
const TRAIL_SOURCE_ID = "rider-trail";
const ROUTE_GREEN = "#22c55e";
const ROUTE_GREEN_CASING = "#ffffff";
const ROUTE_LIVE_LINE_WIDTH = 4;
const ROUTE_LIVE_CASING_WIDTH = 7;
const ROUTE_PLANNED_COLOR = "#94a3b8";
const CONNECTOR_SOURCE_ID = "route-connectors";
const CONNECTOR_CASING_LAYER_ID = "route-connectors-casing";
const CONNECTOR_LAYER_ID = "route-connectors-line";
const MAP_STYLE = "mapbox://styles/mapbox/standard";
const MAP_INITIAL_ZOOM = 15;
const MAP_FIT_MAX_ZOOM = 17;
const SAME_POINT_METERS = 18;
const ROUTE_REFRESH_METERS = 35;
const CONNECTOR_MIN_METERS = 6;
const RIDER_ANIM_MIN_MS = 400;
const RIDER_ANIM_MAX_MS = 2800;
const RIDER_ANIM_MIN_DIST_M = 0.35;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function riderAnimationDurationMs(distanceM: number): number {
  const scaled = distanceM * 48;
  return Math.round(Math.min(RIDER_ANIM_MAX_MS, Math.max(RIDER_ANIM_MIN_MS, scaled)));
}

function getMarkerLngLat(marker: { getLngLat?: () => { lng: number; lat: number } }): [number, number] | null {
  try {
    const ll = marker.getLngLat?.();
    if (!ll || !Number.isFinite(ll.lng) || !Number.isFinite(ll.lat)) return null;
    return [ll.lng, ll.lat];
  } catch {
    return null;
  }
}

function setRiderBikeHeading(
  marker: { getElement?: () => HTMLElement },
  headingDeg: number | null | undefined
) {
  if (headingDeg == null || !Number.isFinite(headingDeg)) return;
  const img = marker.getElement?.()?.querySelector(".gm-location-marker__bike") as HTMLElement | null;
  if (img) img.style.transform = `rotate(${headingDeg}deg)`;
}

async function geocodeAddressQuery(query: string): Promise<[number, number] | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const res = await fetch("/api/merchant/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q }),
    });
    const body = (await res.json()) as {
      success?: boolean;
      results?: { latitude: number; longitude: number }[];
    };
    if (!body?.success || !body.results?.[0]) return null;
    const { latitude, longitude } = body.results[0];
    return toMapLngLat(latitude, longitude);
  } catch {
    return null;
  }
}

function overlapMarkerOffsets(
  entries: Array<{ id: string; point: [number, number] }>
): Map<string, [number, number]> {
  const offsets = new Map<string, [number, number]>();
  const assigned = new Set<string>();

  for (const entry of entries) {
    if (assigned.has(entry.id)) continue;
    const cluster = entries.filter(
      (other) => !assigned.has(other.id) && samePoint(other.point, entry.point)
    );
    cluster.forEach((member, index) => {
      assigned.add(member.id);
      const spread = 44;
      const x = Math.round((index - (cluster.length - 1) / 2) * spread);
      offsets.set(member.id, cluster.length > 1 ? [x, 0] : [0, 0]);
    });
  }

  return offsets;
}

function getMapboxToken(): string | undefined {
  return (
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_MAPBOX_TOKEN) ||
    (typeof process !== "undefined" && process.env?.MAPBOX_PUBLIC_TOKEN) ||
    undefined
  );
}

function haversineMeters(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function samePoint(a: [number, number], b: [number, number]): boolean {
  return haversineMeters(a, b) < SAME_POINT_METERS;
}

function formatMeters(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)} s`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return rem > 0 ? `${min} min ${rem} s` : `${min} min`;
}

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function isPostPickupPhase(
  orderStatus: string | null | undefined,
  assignmentStatus: string | null | undefined,
  pickedUpAt: string | null | undefined
): boolean {
  if (pickedUpAt) return true;
  const tokens = [normalizeStatus(orderStatus), normalizeStatus(assignmentStatus)];
  return tokens.some((s) =>
    [
      "picked_up",
      "pickup_complete",
      "in_transit",
      "out_for_delivery",
      "delivered",
      "reached_customer",
      "reached_drop",
    ].some((needle) => s.includes(needle))
  );
}

function routeStatusLabel(
  payload: OrderRiderTrackingPayload | null | undefined,
  riderId: number | null | undefined
): string {
  if (!payload?.location) return riderId ? "Awaiting GPS" : "Rider not assigned";
  return "Live route";
}

function initialRiderPos(
  payload: OrderRiderTrackingPayload | null | undefined
): [number, number] | null {
  const loc = payload?.location;
  if (!loc) return null;
  return toMapLngLat(loc.latitude, loc.longitude);
}

function resolveRiderRouteAnchorLngLat(
  payload: OrderRiderTrackingPayload | null,
  opts: {
    orderStatus: string | null | undefined;
    assignmentStatus: string | null | undefined;
    pickedUpAt: string | null | undefined;
    store: [number, number] | null;
    drop: [number, number] | null;
    prevGps: [number, number] | null;
    routeBearingDeg: number | null;
  }
): [number, number] | null {
  const loc = payload?.location;
  if (!loc || !isValidLatLon(loc.latitude, loc.longitude)) return null;

  const postPickup = isPostPickupPhase(
    opts.orderStatus,
    opts.assignmentStatus,
    opts.pickedUpAt
  );
  const destination = postPickup ? opts.drop : opts.store;

  return resolveRiderFrontWheelLngLat({
    latitude: loc.latitude,
    longitude: loc.longitude,
    heading_degrees: loc.heading_degrees,
    prevGps: opts.prevGps,
    destination,
    routeBearingDeg: opts.routeBearingDeg,
  });
}

/** Single active leg only: pre-pickup rider→store, post-pickup rider→customer (never both). */
function resolveLiveRouteEndpoints(
  rider: [number, number] | null,
  pickup: [number, number] | null,
  drop: [number, number] | null,
  orderStatus: string | null | undefined,
  assignmentStatus: string | null | undefined,
  pickedUpAt: string | null | undefined
): RouteEndpoints | null {
  const postPickup = isPostPickupPhase(orderStatus, assignmentStatus, pickedUpAt);

  if (!rider) return null;

  const destination = postPickup ? drop : pickup;
  if (destination && !samePoint(rider, destination)) {
    return { from: rider, to: destination, mode: "live" };
  }

  return null;
}

function movementPhaseLabel(
  orderStatus: string | null | undefined,
  assignmentStatus: string | null | undefined,
  pickedUpAt: string | null | undefined
): string {
  return isPostPickupPhase(orderStatus, assignmentStatus, pickedUpAt)
    ? "Rider → customer"
    : "Rider → restaurant";
}

async function fetchMapboxDrivingGeometry(
  from: [number, number],
  to: [number, number]
): Promise<{
  geometry: { coordinates?: [number, number][] } | null;
  json: Record<string, unknown>;
}> {
  const token = getMapboxToken();
  if (!token) return { geometry: null, json: {} };

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${from[0]},${from[1]};${to[0]},${to[1]}` +
    `?overview=full&geometries=geojson&steps=true&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url);
  const json = (await res.json()) as Record<string, unknown>;
  const geometry = (json.routes as Record<string, unknown>[] | undefined)?.[0]?.geometry as
    | { coordinates?: [number, number][] }
    | undefined;

  return { geometry: geometry ?? null, json };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TEARDROP_PIN_SVG = `<svg class="gm-teardrop-pin__shape" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 0C8.82 0 3 5.58 3 12.46c0 8.12 11.11 20.9 12.28 22.22a1.2 1.2 0 0 0 1.44 0C17.89 33.36 29 20.58 29 12.46 29 5.58 23.18 0 16 0z"/></svg>`;

const STORE_BUILDING_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>`;

function markerInitials(name: string | null | undefined): string {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "CX";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function appendTeardropPin(
  pin: HTMLDivElement,
  variant: "store" | "customer",
  displayName?: string | null
) {
  pin.classList.add("gm-location-marker__pin--teardrop");
  const wrap = document.createElement("div");
  wrap.className = "gm-teardrop-pin";
  wrap.innerHTML = TEARDROP_PIN_SVG;

  const icon = document.createElement("div");
  icon.className = `gm-teardrop-pin__icon gm-teardrop-pin__icon--${variant}`;
  if (variant === "store") {
    icon.innerHTML = STORE_BUILDING_SVG;
  } else {
    icon.textContent = markerInitials(displayName);
  }
  wrap.appendChild(icon);
  pin.appendChild(wrap);
}

function isMarkerLabelOpen(marker: { getElement?: () => HTMLElement } | undefined): boolean {
  const el = marker?.getElement?.();
  return Boolean(el?.classList.contains("gm-location-marker--label-open"));
}

function createLocationMarkerElement(config: {
  variant: "store" | "customer" | "rider";
  label: string;
  name?: string | null;
  labelOpen?: boolean;
  headingDeg?: number | null;
}): HTMLDivElement {
  const { variant, label, name, labelOpen = false, headingDeg } = config;
  const displayName = name?.trim();

  const root = document.createElement("div");
  root.className = `gm-location-marker gm-location-marker--${variant}${
    labelOpen ? " gm-location-marker--label-open" : ""
  }`;

  const chip = document.createElement("div");
  chip.className = "gm-location-marker__chip";

  const chipHeader = document.createElement("div");
  chipHeader.className = "gm-location-marker__chip-header";

  const badge = document.createElement("span");
  badge.className = "gm-location-marker__badge";
  badge.textContent = label;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "gm-location-marker__close";
  closeBtn.setAttribute("aria-label", `Hide ${label} label`);
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    root.classList.remove("gm-location-marker--label-open");
  });

  chipHeader.append(badge, closeBtn);
  chip.appendChild(chipHeader);

  if (displayName) {
    const nameEl = document.createElement("span");
    nameEl.className = "gm-location-marker__name";
    nameEl.textContent = displayName;
    chip.appendChild(nameEl);
  }

  const pin = document.createElement("div");
  pin.className = "gm-location-marker__pin";
  pin.setAttribute("role", "button");
  pin.setAttribute("tabindex", "0");
  pin.setAttribute("aria-label", `Show ${label} label`);
  const openLabel = () => root.classList.add("gm-location-marker--label-open");
  pin.addEventListener("click", (e) => {
    e.stopPropagation();
    openLabel();
  });
  pin.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      openLabel();
    }
  });

  if (variant === "rider") {
    const img = document.createElement("img");
    img.src = RIDER_MAP_BIKE_SRC;
    img.alt = displayName ? `${displayName}, rider` : "Rider";
    img.className = "gm-location-marker__bike";
    img.width = 34;
    img.height = 34;
    img.draggable = false;
    if (headingDeg != null && Number.isFinite(headingDeg)) {
      img.style.transform = `rotate(${headingDeg}deg)`;
    }
    pin.appendChild(img);
  } else {
    appendTeardropPin(pin, variant, displayName);
  }

  root.append(chip, pin);
  return root;
}

export default function RiderRouteMap({
  orderId,
  riderId,
  riderName,
  storeName,
  customerName,
  dropAddressFallback,
  merchantStoreLat,
  merchantStoreLon,
  pickupAddressGeocoded,
  orderStatus,
  pickedUpAt,
  pickupLat,
  pickupLon,
  dropLat,
  dropLon,
  initialTracking = null,
  className = "",
}: RiderRouteMapProps) {
  const storePoint = useMemo(
    () =>
      resolveStoreMapLngLat({
        merchantLat: merchantStoreLat,
        merchantLon: merchantStoreLon,
        pickupLat,
        pickupLon,
        pickupGeocoded: pickupAddressGeocoded,
      }),
    [merchantStoreLat, merchantStoreLon, pickupLat, pickupLon, pickupAddressGeocoded]
  );

  const drop = useMemo(() => toMapLngLat(dropLat, dropLon), [dropLat, dropLon]);
  const [geocodedDrop, setGeocodedDrop] = useState<[number, number] | null>(null);
  const effectiveDrop = drop ?? geocodedDrop;

  const coordKey = useMemo(
    () =>
      [
        storePoint?.[0] ?? "",
        storePoint?.[1] ?? "",
        effectiveDrop?.[0] ?? "",
        effectiveDrop?.[1] ?? "",
      ].join("|"),
    [storePoint, effectiveDrop]
  );

  const routePhaseKey = useMemo(
    () =>
      [
        coordKey,
        pickedUpAt ?? "",
        normalizeStatus(orderStatus),
      ].join("|"),
    [coordKey, pickedUpAt, orderStatus]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<{ store?: any; customer?: any; rider?: any }>({});
  const prevRiderPosRef = useRef<[number, number] | null>(initialRiderPos(initialTracking));
  const lastRiderAnchorRef = useRef<[number, number] | null>(null);
  const lastTrailAnimatedIndexRef = useRef(0);
  const riderAnimFrameRef = useRef<number | null>(null);
  const riderMoveQueueRef = useRef<[number, number][]>([]);
  const riderMovePlayingRef = useRef(false);
  const mapReadyRef = useRef(false);
  const hasRiderAssignment =
    riderId != null && Number.isFinite(Number(riderId)) && Number(riderId) > 0;

  const cancelRiderAnimation = useCallback(() => {
    if (riderAnimFrameRef.current != null) {
      cancelAnimationFrame(riderAnimFrameRef.current);
      riderAnimFrameRef.current = null;
    }
  }, []);
  const trackingRef = useRef<OrderRiderTrackingPayload | null>(initialTracking);
  const boundsFittedRef = useRef(false);
  const userControlsViewRef = useRef(false);
  const lastRouteFromRef = useRef<[number, number] | null>(null);
  const lastRouteModeRef = useRef<"live" | "planned" | null>(null);
  const lastRouteBearingRef = useRef<number | null>(null);
  const lastRouteGeometryRef = useRef<{ coordinates?: [number, number][] } | null>(null);
  const lastRouteEndpointsRef = useRef<RouteEndpoints | null>(null);
  const lastDeliveryLegKeyRef = useRef<string | null>(null);
  const storeRef = useRef(storePoint);
  const dropRef = useRef(effectiveDrop);
  const storeNameRef = useRef(storeName);
  const customerNameRef = useRef(customerName);
  const initStartedRef = useRef(false);

  storeRef.current = storePoint;
  dropRef.current = effectiveDrop;
  storeNameRef.current = storeName;
  customerNameRef.current = customerName;

  const [containerReady, setContainerReady] = useState(false);

  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setContainerReady(Boolean(node));
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<OrderRiderTrackingPayload | null>(initialTracking);
  const [movementLabel, setMovementLabel] = useState(() =>
    routeStatusLabel(initialTracking, riderId)
  );
  const [routeSheetOpen, setRouteSheetOpen] = useState(false);
  const [routeSheet, setRouteSheet] = useState<RouteSheetData | null>(null);

  trackingRef.current = tracking;

  const resolveRiderRouteAnchor = useCallback(
    (payload: OrderRiderTrackingPayload | null, assignmentStatus: string | null | undefined) =>
      resolveRiderRouteAnchorLngLat(payload, {
        orderStatus,
        assignmentStatus,
        pickedUpAt,
        store: storeRef.current,
        drop: dropRef.current,
        prevGps: prevRiderPosRef.current,
        routeBearingDeg: lastRouteBearingRef.current,
      }),
    [orderStatus, pickedUpAt]
  );

  const applyConnectorLines = useCallback(
    (
      map: any,
      geometry: { coordinates?: [number, number][] },
      endpoints: RouteEndpoints,
      riderRouteAnchor: [number, number] | null,
      assignmentStatus: string | null
    ) => {
      const coords = geometry.coordinates;
      if (!coords?.length) {
        if (map.getSource(CONNECTOR_SOURCE_ID)) {
          map.getSource(CONNECTOR_SOURCE_ID).setData({ type: "FeatureCollection", features: [] });
        }
        return;
      }

      const routeStart = coords[0];
      const routeEnd = coords[coords.length - 1];
      const store = storeRef.current;
      const drop = dropRef.current;
      const segments: Array<{ from: [number, number]; to: [number, number] }> = [];

      const pushSegment = (from: [number, number], to: [number, number]) => {
        if (haversineMeters(from, to) < CONNECTOR_MIN_METERS) return;
        segments.push({ from, to });
      };

      const postPickup = isPostPickupPhase(orderStatus, assignmentStatus, pickedUpAt);
      if (endpoints.mode === "live") {
        const destPin = postPickup ? drop : store;
        if (destPin) pushSegment(routeEnd, destPin);
        if (riderRouteAnchor) pushSegment(riderRouteAnchor, routeStart);
      }

      const collection = {
        type: "FeatureCollection",
        features: segments.map((seg, index) => ({
          type: "Feature",
          properties: { id: index },
          geometry: { type: "LineString", coordinates: [seg.from, seg.to] },
        })),
      };

      const isLive = endpoints.mode === "live";
      const lineColor = isLive ? ROUTE_GREEN : ROUTE_PLANNED_COLOR;

      if (map.getSource(CONNECTOR_SOURCE_ID)) {
        map.getSource(CONNECTOR_SOURCE_ID).setData(collection);
        map.setPaintProperty(CONNECTOR_LAYER_ID, "line-color", lineColor);
        return;
      }

      map.addSource(CONNECTOR_SOURCE_ID, { type: "geojson", data: collection });
      map.addLayer({
        id: CONNECTOR_CASING_LAYER_ID,
        type: "line",
        source: CONNECTOR_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ROUTE_GREEN_CASING,
          "line-width": 5,
          "line-opacity": 1,
        },
      });
      map.addLayer({
        id: CONNECTOR_LAYER_ID,
        type: "line",
        source: CONNECTOR_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": lineColor,
          "line-width": 2.5,
          "line-opacity": 0.95,
          "line-dasharray": [1.2, 1.8],
        },
      });
    },
    [orderStatus, pickedUpAt]
  );

  const applyRouteGeometry = useCallback(
    (map: any, geometry: { coordinates?: [number, number][] }, mode: "live" | "planned") => {
      if (!geometry?.coordinates?.length) return;
      const geojson = { type: "Feature", geometry };
      const isLive = mode === "live";
      const lineColor = isLive ? ROUTE_GREEN : ROUTE_PLANNED_COLOR;
      const lineWidth = isLive ? ROUTE_LIVE_LINE_WIDTH : 3;
      const casingWidth = isLive ? ROUTE_LIVE_CASING_WIDTH : 5;

      if (map.getSource(ROUTE_SOURCE_ID)) {
        map.getSource(ROUTE_SOURCE_ID).setData(geojson);
        map.setPaintProperty(ROUTE_CASING_LAYER_ID, "line-width", casingWidth);
        map.setPaintProperty(ROUTE_LAYER_ID, "line-color", lineColor);
        map.setPaintProperty(ROUTE_LAYER_ID, "line-width", lineWidth);
        if (mode === "planned") {
          map.setPaintProperty(ROUTE_LAYER_ID, "line-dasharray", [2, 2]);
        } else {
          map.setPaintProperty(ROUTE_LAYER_ID, "line-dasharray", [1]);
        }
        return;
      }

      map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: geojson });
      map.addLayer({
        id: ROUTE_CASING_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ROUTE_GREEN_CASING,
          "line-width": casingWidth,
          "line-opacity": 1,
        },
      });
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": lineColor,
          "line-width": lineWidth,
          "line-opacity": 1,
          ...(mode === "planned" ? { "line-dasharray": [2, 2] } : {}),
        },
      });
    },
    []
  );

  const clearDeliveryLegRoute = useCallback((map: any) => {
    for (const id of [DELIVERY_ROUTE_LAYER_ID, DELIVERY_ROUTE_CASING_LAYER_ID]) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(DELIVERY_ROUTE_SOURCE_ID)) map.removeSource(DELIVERY_ROUTE_SOURCE_ID);
  }, []);

  const applyDeliveryLegGeometry = useCallback(
    (map: any, geometry: { coordinates?: [number, number][] }) => {
      if (!geometry?.coordinates?.length) return;
      const geojson = { type: "Feature", geometry };

      if (map.getSource(DELIVERY_ROUTE_SOURCE_ID)) {
        map.getSource(DELIVERY_ROUTE_SOURCE_ID).setData(geojson);
        return;
      }

      const beforeLiveRoute = map.getLayer(ROUTE_CASING_LAYER_ID)
        ? ROUTE_CASING_LAYER_ID
        : undefined;

      map.addSource(DELIVERY_ROUTE_SOURCE_ID, { type: "geojson", data: geojson });
      map.addLayer(
        {
          id: DELIVERY_ROUTE_CASING_LAYER_ID,
          type: "line",
          source: DELIVERY_ROUTE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ROUTE_GREEN_CASING,
            "line-width": ROUTE_LIVE_CASING_WIDTH,
            "line-opacity": 1,
          },
        },
        beforeLiveRoute
      );
      map.addLayer(
        {
          id: DELIVERY_ROUTE_LAYER_ID,
          type: "line",
          source: DELIVERY_ROUTE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ROUTE_GREEN,
            "line-width": ROUTE_LIVE_LINE_WIDTH,
            "line-opacity": 0.92,
          },
        },
        beforeLiveRoute
      );
    },
    []
  );

  const fitMapToPoints = useCallback(
    (
      mapboxgl: any,
      map: any,
      riderPoint: [number, number] | null,
      assignmentStatus: string | null | undefined
    ) => {
      if (userControlsViewRef.current || boundsFittedRef.current) return;

      const postPickup = isPostPickupPhase(orderStatus, assignmentStatus, pickedUpAt);
      const bounds = new mapboxgl.LngLatBounds();
      let hasBounds = false;
      const storeLngLat = storeRef.current;
      const dropPoint = dropRef.current;
      if (storeLngLat && !postPickup) {
        bounds.extend(storeLngLat);
        hasBounds = true;
      }
      if (dropPoint && postPickup) {
        bounds.extend(dropPoint);
        hasBounds = true;
      }
      if (riderPoint) {
        bounds.extend(riderPoint);
        hasBounds = true;
      }
      if (hasBounds) {
        map.fitBounds(bounds, { padding: 72, duration: 0, maxZoom: MAP_FIT_MAX_ZOOM });
        boundsFittedRef.current = true;
      }
      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {
          /* ignore */
        }
      });
    },
    []
  );

  const loadRoute = useCallback(
    async (
      map: any,
      riderRouteAnchor: [number, number] | null,
      assignmentStatus: string | null
    ) => {
      if (!getMapboxToken() || !mapReadyRef.current) return;

      clearDeliveryLegRoute(map);
      lastDeliveryLegKeyRef.current = null;

      const endpoints = resolveLiveRouteEndpoints(
        riderRouteAnchor,
        storeRef.current,
        dropRef.current,
        orderStatus,
        assignmentStatus,
        pickedUpAt
      );

      if (!endpoints) {
        lastRouteGeometryRef.current = null;
        lastRouteEndpointsRef.current = null;
        lastRouteFromRef.current = null;
        lastRouteModeRef.current = null;
        if (map.getSource(ROUTE_SOURCE_ID)) {
          map.getSource(ROUTE_SOURCE_ID).setData({
            type: "Feature",
            geometry: { type: "LineString", coordinates: [] },
          });
        }
        if (map.getSource(CONNECTOR_SOURCE_ID)) {
          map.getSource(CONNECTOR_SOURCE_ID).setData({ type: "FeatureCollection", features: [] });
        }
        return;
      }

      if (endpoints.mode === "live" && lastRouteFromRef.current) {
        const moved = haversineMeters(lastRouteFromRef.current, endpoints.from);
        const modeSame = lastRouteModeRef.current === endpoints.mode;
        if (modeSame && moved < ROUTE_REFRESH_METERS) {
          if (lastRouteGeometryRef.current) {
            applyConnectorLines(
              map,
              lastRouteGeometryRef.current,
              endpoints,
              riderRouteAnchor,
              assignmentStatus
            );
          }
          return;
        }
      }

      try {
        const { geometry, json } = await fetchMapboxDrivingGeometry(endpoints.from, endpoints.to);

        if (geometry?.coordinates?.length && mapReadyRef.current) {
          const coords = geometry.coordinates;
          if (coords.length >= 2) {
            lastRouteBearingRef.current = bearingDegreesLngLat(coords[0], coords[1]);
          }
          lastRouteGeometryRef.current = geometry;
          lastRouteEndpointsRef.current = endpoints;
          applyRouteGeometry(map, geometry, endpoints.mode);
          applyConnectorLines(map, geometry, endpoints, riderRouteAnchor, assignmentStatus);
          setRouteSheet(parseMapboxRouteSheet(json));
          lastRouteFromRef.current = endpoints.from;
          lastRouteModeRef.current = endpoints.mode;
        }
      } catch {
        /* route optional */
      }
    },
    [orderStatus, pickedUpAt, applyRouteGeometry, applyConnectorLines, clearDeliveryLegRoute]
  );

  useEffect(() => {
    if (drop) {
      setGeocodedDrop(null);
      return;
    }
    const q = dropAddressFallback?.trim();
    if (!q) {
      setGeocodedDrop(null);
      return;
    }

    let cancelled = false;
    void geocodeAddressQuery(q).then((lngLat) => {
      if (!cancelled && lngLat) setGeocodedDrop(lngLat);
    });

    return () => {
      cancelled = true;
    };
  }, [drop, dropAddressFallback]);

  const syncPlaceMarkers = useCallback((mapboxgl: any, map: any) => {
    if (!mapReadyRef.current || !map) return;

    const pickupPoint = storeRef.current;
    const dropPoint = dropRef.current;
    const assignmentStatus = trackingRef.current?.rider?.assignment_status;
    const postPickup = isPostPickupPhase(orderStatus, assignmentStatus, pickedUpAt);
    const riderRouteAnchor = resolveRiderRouteAnchorLngLat(trackingRef.current, {
      orderStatus,
      assignmentStatus,
      pickedUpAt,
      store: pickupPoint,
      drop: dropPoint,
      prevGps: prevRiderPosRef.current,
      routeBearingDeg: lastRouteBearingRef.current,
    });

    const pointEntries = [
      ...(pickupPoint ? [{ id: "store" as const, point: pickupPoint }] : []),
      ...(postPickup && dropPoint ? [{ id: "customer" as const, point: dropPoint }] : []),
      ...(riderRouteAnchor ? [{ id: "rider" as const, point: riderRouteAnchor }] : []),
    ];
    const offsets = overlapMarkerOffsets(pointEntries);

    const placeMarker = (
      kind: "store" | "customer",
      point: [number, number],
      label: string,
      name: string | null | undefined
    ) => {
      const offset = offsets.get(kind) ?? [0, 0];
      const labelWasOpen = isMarkerLabelOpen(markersRef.current[kind]);
      if (markersRef.current[kind]) {
        markersRef.current[kind]!.remove();
        markersRef.current[kind] = undefined;
      }
      const el = createLocationMarkerElement({
        variant: kind,
        label,
        name,
        labelOpen: labelWasOpen,
      });
      markersRef.current[kind] = new mapboxgl.Marker({
        element: el,
        anchor: "bottom",
        offset,
      })
        .setLngLat(point)
        .addTo(map);
    };

    if (pickupPoint) {
      placeMarker("store", pickupPoint, "Store Location", storeNameRef.current);
    } else if (markersRef.current.store) {
      markersRef.current.store.remove();
      markersRef.current.store = undefined;
    }

    if (postPickup && dropPoint) {
      placeMarker("customer", dropPoint, "Customer", customerNameRef.current);
    } else if (markersRef.current.customer) {
      markersRef.current.customer.remove();
      markersRef.current.customer = undefined;
    }
  }, [orderStatus, pickedUpAt]);

  const fetchTracking = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/rider-tracking`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as OrderRiderTrackingPayload;
      setTracking(json);

      const loc = json.location;
      if (!loc) {
        setMovementLabel(riderId ? "Awaiting GPS" : "Rider not assigned");
        prevRiderPosRef.current = null;
        return;
      }

      const assignmentStatus = json.rider?.assignment_status;
      setMovementLabel(
        json.location
          ? `${routeStatusLabel(json, riderId)} · ${movementPhaseLabel(orderStatus, assignmentStatus, pickedUpAt)}`
          : routeStatusLabel(json, riderId)
      );
    } catch {
      /* keep last tracking */
    }
  }, [orderId, riderId, orderStatus, pickedUpAt]);

  useEffect(() => {
    void fetchTracking();
    const id = window.setInterval(() => void fetchTracking(), POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchTracking]);

  const updateTrailOnMap = useCallback((map: any, payload: OrderRiderTrackingPayload | null) => {
    const trail = payload?.trail ?? [];
    let trailCoords =
      trail.length >= 1
        ? trail.map((p) => [p.longitude, p.latitude] as [number, number])
        : [];

    const loc = payload?.location;
    if (loc && isValidLatLon(loc.latitude, loc.longitude)) {
      const livePoint: [number, number] = [loc.longitude, loc.latitude];
      const last = trailCoords[trailCoords.length - 1];
      if (!last || haversineMeters(last, livePoint) > 8) {
        trailCoords = [...trailCoords, livePoint];
      } else {
        trailCoords = [...trailCoords.slice(0, -1), livePoint];
      }
    }

    if (trailCoords.length < 2) return;

    const geojson = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: trailCoords },
    };
    if (map.getSource(TRAIL_SOURCE_ID)) {
      map.getSource(TRAIL_SOURCE_ID).setData(geojson);
    } else {
      map.addSource(TRAIL_SOURCE_ID, { type: "geojson", data: geojson });
      map.addLayer({
        id: `${TRAIL_SOURCE_ID}-casing`,
        type: "line",
        source: TRAIL_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ROUTE_GREEN_CASING,
          "line-width": 5,
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: `${TRAIL_SOURCE_ID}-line`,
        type: "line",
        source: TRAIL_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ROUTE_GREEN,
          "line-width": 2.5,
          "line-opacity": 0.75,
        },
      });
    }
  }, []);

  const animateRiderTo = useCallback(
    (marker: any, to: [number, number], headingDeg: number | null | undefined): Promise<void> => {
      return new Promise((resolve) => {
        const from = getMarkerLngLat(marker) ?? lastRiderAnchorRef.current ?? to;
        const dist = haversineMeters(from, to);
        setRiderBikeHeading(marker, headingDeg);

        if (dist < RIDER_ANIM_MIN_DIST_M) {
          cancelRiderAnimation();
          marker.setLngLat(to);
          resolve();
          return;
        }

        const duration = riderAnimationDurationMs(dist);
        cancelRiderAnimation();
        const start = performance.now();

        const step = (now: number) => {
          const t = easeOutCubic(Math.min(1, (now - start) / duration));
          marker.setLngLat([
            from[0] + (to[0] - from[0]) * t,
            from[1] + (to[1] - from[1]) * t,
          ]);
          if (t < 1) {
            riderAnimFrameRef.current = requestAnimationFrame(step);
          } else {
            riderAnimFrameRef.current = null;
            marker.setLngLat(to);
            resolve();
          }
        };

        riderAnimFrameRef.current = requestAnimationFrame(step);
      });
    },
    [cancelRiderAnimation]
  );

  const pumpRiderMoveQueue = useCallback(
    async (marker: any, headingDeg: number | null | undefined) => {
      if (riderMovePlayingRef.current) return;
      riderMovePlayingRef.current = true;
      try {
        while (riderMoveQueueRef.current.length > 0) {
          const next = riderMoveQueueRef.current.shift()!;
          await animateRiderTo(marker, next, headingDeg);
          lastRiderAnchorRef.current = next;
        }
      } finally {
        riderMovePlayingRef.current = false;
        if (riderMoveQueueRef.current.length > 0) {
          void pumpRiderMoveQueue(marker, headingDeg);
        }
      }
    },
    [animateRiderTo]
  );

  const queueRiderMovement = useCallback(
    (marker: any, waypoints: [number, number][], headingDeg: number | null | undefined) => {
      if (!waypoints.length) return;
      riderMoveQueueRef.current.push(...waypoints);
      void pumpRiderMoveQueue(marker, headingDeg);
    },
    [pumpRiderMoveQueue]
  );

  const buildMovementWaypoints = useCallback(
    (
      payload: OrderRiderTrackingPayload | null,
      assignmentStatus: string | null | undefined
    ): [number, number][] => {
      if (!payload) return [];

      const postPickup = isPostPickupPhase(orderStatus, assignmentStatus, pickedUpAt);
      const destination = postPickup ? dropRef.current : storeRef.current;
      const out: [number, number][] = [];
      const trail = payload.trail ?? [];
      const startIdx = lastTrailAnimatedIndexRef.current;

      for (let i = startIdx; i < trail.length; i++) {
        const p = trail[i]!;
        const prevGps =
          i > 0
            ? ([trail[i - 1]!.longitude, trail[i - 1]!.latitude] as [number, number])
            : prevRiderPosRef.current;
        const next = trail[i + 1];
        const routeBearing =
          next != null
            ? bearingDegreesLngLat(
                [p.longitude, p.latitude],
                [next.longitude, next.latitude]
              )
            : lastRouteBearingRef.current;

        const anchor = resolveRiderFrontWheelLngLat({
          latitude: p.latitude,
          longitude: p.longitude,
          heading_degrees: null,
          prevGps,
          destination,
          routeBearingDeg: routeBearing,
        });
        if (!anchor) continue;
        const last = out[out.length - 1] ?? getMarkerLngLat(markersRef.current.rider) ?? lastRiderAnchorRef.current;
        if (!last || haversineMeters(last, anchor) >= RIDER_ANIM_MIN_DIST_M) {
          out.push(anchor);
        }
      }

      lastTrailAnimatedIndexRef.current = trail.length;

      const loc = payload.location;
      if (loc && isValidLatLon(loc.latitude, loc.longitude)) {
        const liveAnchor = resolveRiderRouteAnchorLngLat(payload, {
          orderStatus,
          assignmentStatus,
          pickedUpAt,
          store: storeRef.current,
          drop: dropRef.current,
          prevGps: prevRiderPosRef.current,
          routeBearingDeg: lastRouteBearingRef.current,
        });
        if (liveAnchor) {
          const last = out[out.length - 1] ?? lastRiderAnchorRef.current;
          if (!last || haversineMeters(last, liveAnchor) >= RIDER_ANIM_MIN_DIST_M) {
            out.push(liveAnchor);
          }
        }
      }

      return out;
    },
    [orderStatus, pickedUpAt]
  );

  const updateRiderOnMap = useCallback(
    (mapboxgl: any, map: any, payload: OrderRiderTrackingPayload | null) => {
      if (!mapReadyRef.current || !map || !hasRiderAssignment) return;

      const loc = payload?.location;
      let riderRouteAnchor: [number, number] | null = null;
      let headingDeg: number | null | undefined = lastRouteBearingRef.current;

      if (loc && isValidLatLon(loc.latitude, loc.longitude)) {
        riderRouteAnchor = resolveRiderRouteAnchor(
          payload,
          payload?.rider?.assignment_status ?? null
        );
        if (riderRouteAnchor) {
          lastRiderAnchorRef.current = riderRouteAnchor;
          headingDeg =
            loc.heading_degrees != null && Number.isFinite(loc.heading_degrees)
              ? loc.heading_degrees
              : lastRouteBearingRef.current;
          if (headingDeg == null && prevRiderPosRef.current) {
            headingDeg = bearingDegreesLngLat(prevRiderPosRef.current, [
              loc.longitude,
              loc.latitude,
            ]);
          }
        }
      } else {
        riderRouteAnchor = lastRiderAnchorRef.current;
      }

      if (!riderRouteAnchor) return;

      const pickupPoint = storeRef.current;
      const dropPoint = dropRef.current;
      const assignmentStatus = payload?.rider?.assignment_status ?? null;
      const postPickup = isPostPickupPhase(orderStatus, assignmentStatus, pickedUpAt);
      const offsets = overlapMarkerOffsets([
        ...(pickupPoint ? [{ id: "store", point: pickupPoint }] : []),
        ...(postPickup && dropPoint ? [{ id: "customer", point: dropPoint }] : []),
        { id: "rider", point: riderRouteAnchor },
      ]);
      const riderOffset = offsets.get("rider") ?? [0, 0];

      const name = riderName?.trim() || payload?.rider?.name?.trim() || null;

      if (!markersRef.current.rider) {
        const el = createLocationMarkerElement({
          variant: "rider",
          label: "Rider",
          name,
          labelOpen: false,
          headingDeg,
        });
        markersRef.current.rider = new mapboxgl.Marker({
          element: el,
          anchor: "center",
          offset: riderOffset,
        })
          .setLngLat(riderRouteAnchor)
          .addTo(map);
        setRiderBikeHeading(markersRef.current.rider, headingDeg);
        lastTrailAnimatedIndexRef.current = payload?.trail?.length ?? 0;
      } else {
        markersRef.current.rider.setOffset(riderOffset);
        const waypoints = buildMovementWaypoints(
          payload,
          payload?.rider?.assignment_status ?? null
        );
        if (waypoints.length > 0) {
          queueRiderMovement(markersRef.current.rider, waypoints, headingDeg);
        } else {
          setRiderBikeHeading(markersRef.current.rider, headingDeg);
        }
      }

      if (loc && isValidLatLon(loc.latitude, loc.longitude)) {
        prevRiderPosRef.current = [loc.longitude, loc.latitude];
      }

      updateTrailOnMap(map, payload);
    },
    [
      hasRiderAssignment,
      riderName,
      updateTrailOnMap,
      resolveRiderRouteAnchor,
      buildMovementWaypoints,
      queueRiderMovement,
    ]
  );

  const loadRouteRef = useRef(loadRoute);
  loadRouteRef.current = loadRoute;
  const fitMapToPointsRef = useRef(fitMapToPoints);
  fitMapToPointsRef.current = fitMapToPoints;
  const updateRiderOnMapRef = useRef(updateRiderOnMap);
  updateRiderOnMapRef.current = updateRiderOnMap;
  const syncPlaceMarkersRef = useRef(syncPlaceMarkers);
  syncPlaceMarkersRef.current = syncPlaceMarkers;

  useEffect(() => {
    if (!mapReadyRef.current || !mapRef.current) return;
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;

    syncPlaceMarkers(mapboxgl, mapRef.current);
    updateRiderOnMap(mapboxgl, mapRef.current, tracking);
    const riderRouteAnchor = resolveRiderRouteAnchor(
      tracking,
      tracking?.rider?.assignment_status ?? null
    );
    void loadRoute(
      mapRef.current,
      riderRouteAnchor,
      tracking?.rider?.assignment_status ?? null
    );
  }, [tracking, updateRiderOnMap, loadRoute, syncPlaceMarkers, resolveRiderRouteAnchor]);

  useEffect(() => {
    if (!mapReadyRef.current || !mapRef.current) return;
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;
    syncPlaceMarkers(mapboxgl, mapRef.current);
    const riderRouteAnchor = resolveRiderRouteAnchor(
      trackingRef.current,
      trackingRef.current?.rider?.assignment_status ?? null
    );
    void loadRouteRef.current(
      mapRef.current,
      riderRouteAnchor,
      trackingRef.current?.rider?.assignment_status ?? null
    );
    if (!boundsFittedRef.current && !userControlsViewRef.current) {
      fitMapToPoints(
        mapboxgl,
        mapRef.current,
        riderRouteAnchor,
        trackingRef.current?.rider?.assignment_status ?? null
      );
    }
  }, [routePhaseKey, syncPlaceMarkers, fitMapToPoints, resolveRiderRouteAnchor, orderStatus, pickedUpAt]);

  useEffect(() => {
    if (!mapReadyRef.current || !mapRef.current) return;
    lastRouteFromRef.current = null;
    lastRouteModeRef.current = null;
    lastRouteGeometryRef.current = null;
    lastRouteEndpointsRef.current = null;
    boundsFittedRef.current = false;
  }, [routePhaseKey]);

  useEffect(() => {
    if (!containerReady || !containerRef.current) return;

    const container = containerRef.current;
    const token = getMapboxToken();

    if (!token) {
      setError("Mapbox token not configured");
      return;
    }

    const initialRiderAnchor = resolveRiderRouteAnchorLngLat(trackingRef.current, {
      orderStatus,
      assignmentStatus: trackingRef.current?.rider?.assignment_status,
      pickedUpAt,
      store: storeRef.current,
      drop: dropRef.current,
      prevGps: prevRiderPosRef.current,
      routeBearingDeg: null,
    });
    const mapCenter: [number, number] | null =
      initialRiderAnchor ?? storeRef.current ?? dropRef.current ?? null;

    if (!mapCenter) {
      setError("Location coordinates not available for this order");
      return;
    }

    setError(null);
    let cancelled = false;
    boundsFittedRef.current = false;
    userControlsViewRef.current = false;
    lastRouteFromRef.current = null;
    lastRouteModeRef.current = null;
    initStartedRef.current = true;

    (async () => {
      try {
        await mapCache.loadMapboxScript();
        if (cancelled || !containerRef.current) return;

        const mapboxgl = (window as any).mapboxgl;
        if (!mapboxgl) {
          setError("Mapbox library not available");
          return;
        }

        mapboxgl.accessToken = token;

        const map = new mapboxgl.Map({
          container,
          style: MAP_STYLE,
          center: mapCenter,
          zoom: MAP_INITIAL_ZOOM,
          attributionControl: true,
          accessToken: token,
        });

        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl(), "top-left");

        const lockUserView = (e?: { originalEvent?: unknown }) => {
          if (e?.originalEvent != null) {
            userControlsViewRef.current = true;
          }
        };
        map.on("dragstart", lockUserView);
        map.on("zoomstart", lockUserView);
        map.on("rotatestart", lockUserView);
        map.on("pitchstart", lockUserView);

        map.on("load", () => {
          if (cancelled) return;
          mapReadyRef.current = true;

          syncPlaceMarkersRef.current(mapboxgl, map);
          updateRiderOnMapRef.current(mapboxgl, map, trackingRef.current);

          const riderRouteAnchor = resolveRiderRouteAnchorLngLat(trackingRef.current, {
            orderStatus,
            assignmentStatus: trackingRef.current?.rider?.assignment_status,
            pickedUpAt,
            store: storeRef.current,
            drop: dropRef.current,
            prevGps: prevRiderPosRef.current,
            routeBearingDeg: lastRouteBearingRef.current,
          });

          void loadRouteRef.current(
            map,
            riderRouteAnchor,
            trackingRef.current?.rider?.assignment_status ?? null
          );
          fitMapToPointsRef.current(
            mapboxgl,
            map,
            riderRouteAnchor,
            trackingRef.current?.rider?.assignment_status ?? null
          );

          const resizeMap = () => {
            try {
              map.resize();
            } catch {
              /* ignore */
            }
          };
          requestAnimationFrame(resizeMap);
          window.setTimeout(resizeMap, 150);
        });

        map.on("error", (e: { error?: { message?: string } }) => {
          const msg = e?.error?.message ?? "";
          const errorType = (e?.error as { type?: string } | undefined)?.type ?? "";
          const isTileError =
            msg.includes("tile") ||
            msg.includes("vector.pbf") ||
            errorType === "TileLoadError" ||
            errorType === "StyleImageMissing";
          if (msg && !cancelled && !isTileError) {
            setError(`Map error: ${msg.slice(0, 120)}`);
          }
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load map");
        }
      }
    })();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (mapRef.current) {
              try {
                mapRef.current.resize();
              } catch {
                /* ignore */
              }
            }
          })
        : null;
    resizeObserver?.observe(container);

    return () => {
      cancelled = true;
      if (riderAnimFrameRef.current != null) {
        cancelAnimationFrame(riderAnimFrameRef.current);
        riderAnimFrameRef.current = null;
      }
      mapReadyRef.current = false;
      userControlsViewRef.current = false;
      initStartedRef.current = false;
      markersRef.current = {};
      lastRiderAnchorRef.current = null;
      lastTrailAnimatedIndexRef.current = 0;
      riderMoveQueueRef.current = [];
      riderMovePlayingRef.current = false;
      boundsFittedRef.current = false;
      lastRouteFromRef.current = null;
      lastRouteModeRef.current = null;
      lastRouteBearingRef.current = null;
      lastRouteGeometryRef.current = null;
      lastRouteEndpointsRef.current = null;
      lastDeliveryLegKeyRef.current = null;
      resizeObserver?.disconnect();
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          /* ignore */
        }
        mapRef.current = null;
      }
    };
  }, [containerReady, orderId]);

  const isLive =
    tracking?.location &&
    Date.now() - new Date(tracking.location.updated_at).getTime() < 90_000;

  const canShowRouteSheet = Boolean(routeSheet?.steps.length);

  return (
    <div
      className={`bg-white rounded-lg px-3 py-2 shadow-sm border border-[#e5e5e5] h-full flex flex-col ${className}`}
    >
      <div className="mb-2 pb-1.5 border-b border-[#e5e5e5] flex items-center justify-between gap-2 shrink-0">
        <span className="text-[13px] font-semibold text-gati-text-primary flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-sky-700 text-xs font-semibold">
            M
          </span>
          <span>Live rider map</span>
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            isLive
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-slate-100 text-slate-600 border border-slate-200"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`}
          />
          {movementLabel}
        </span>
      </div>

      <div className="mb-1.5 flex flex-wrap gap-3 text-[10px] text-slate-500 shrink-0">
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-[14px] w-[11px] items-center justify-center text-[#1a1a1a]">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            </svg>
          </span>
          Restaurant
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[7px] font-bold text-white">
            CX
          </span>
          Customer (after pickup)
        </span>
        <span className="inline-flex items-center gap-1">
          <img src={RIDER_MAP_BIKE_SRC} alt="" className="h-4 w-4 object-contain" />
          Rider (live)
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="h-[3px] w-5 rounded-full border border-white bg-green-500 shadow-sm"
            style={{ boxShadow: "0 0 0 1px #fff" }}
          />
          Route / path
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="h-0 w-5 border-t-[2px] border-dashed border-slate-400"
            style={{ boxShadow: "0 0 0 1px #fff" }}
          />
          Pin link (short)
        </span>
      </div>

      <div className="relative flex-1 min-h-[280px] h-[280px] w-full">
        {error ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 text-center">
            {error}
          </div>
        ) : null}
        <div
          ref={containerRefCallback}
          className="absolute inset-0 h-full w-full rounded border border-gray-200 [&_.mapboxgl-canvas]:!w-full [&_.mapboxgl-canvas]:!h-full [&_.mapboxgl-ctrl-bottom-left]:hidden"
        />

            {canShowRouteSheet && !routeSheetOpen ? (
              <button
                type="button"
                onClick={() => setRouteSheetOpen(true)}
                className="absolute top-2 right-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                aria-label="Open route directions"
                title="Route directions"
              >
                <GitBranch className="h-4 w-4" />
              </button>
            ) : null}

            {routeSheetOpen && routeSheet ? (
              <RouteDirectionsSheet
                data={routeSheet}
                onClose={() => setRouteSheetOpen(false)}
              />
            ) : null}
      </div>
    </div>
  );
}
