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
import {
  FOOD_DELIVERY_GEOFENCE_RADIUS_M,
  circlePolygonGeoJson,
  isFoodPostPickupPhase,
  shouldHighlightDropZone,
  shouldHighlightPickupZone,
} from "@/lib/food-delivery-map-phase";
import { useDashboardRiderLocation } from "@/hooks/useDashboardRiderLocation";
import { NavigationFollowController } from "@/lib/map/nav-follow-controller";
import { remainingFromAlong } from "@/lib/map/nav-geometry";
import {
  LIVE_RIDER_MAP_OPTIMIZE,
  LIVE_RIDER_MAP_PROFILE,
  logRouteSelectionDiagnostic,
  selectShortestPracticalRoute,
} from "@/lib/map/unified-route-selector";

interface RiderRouteMapProps {
  orderId: number;
  /**
   * Business order id for ws-gateway `order:{id}` (e.g. GMF100001).
   * Same channel the rider/merchant/customer apps subscribe to.
   */
  orderIdText?: string | null;
  /** Extra channel ids published by backend (raw order_id + formatted). */
  orderChannelIds?: Array<string | null | undefined>;
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
  coreStatus?: string | null;
  foodOrderStatus?: string | null;
  dispatchedAt?: string | null;
  riderPickedUpAt?: string | null;
  reachedMerchantAt?: string | null;
  pickedUpAt?: string | null;
  pickupLat: number | null | undefined;
  pickupLon: number | null | undefined;
  dropLat: number | null | undefined;
  dropLon: number | null | undefined;
  initialTracking?: OrderRiderTrackingPayload | null;
  className?: string;
  /** Legend label for pickup/store pin. Defaults to "Restaurant" (food). */
  pickupLegendLabel?: string;
  /** Legend label for drop/customer pin. Defaults to "Customer (after pickup)". */
  dropLegendLabel?: string;
  /** Badge text before pickup. Defaults to "Rider → restaurant". */
  prePickupMovementLabel?: string;
  /** Badge text after pickup. Defaults to "Rider → customer". */
  postPickupMovementLabel?: string;
  /** When true, always show the drop pin (person ride). Food keeps post-pickup-only. */
  alwaysShowDropMarker?: boolean;
  /** Pickup teardrop icon. Food = building; person ride = person. */
  pickupPinStyle?: "building" | "person";
}

const RIDER_MAP_BIKE_SRC = "/mapbike.png";

type RouteEndpoints = {
  from: [number, number];
  to: [number, number];
  mode: "live" | "planned";
};

/**
 * Rider app writes live location every ~3–5s via /v1/rider/location/ping →
 * Redis `rider.location.updated.v1` → ws-gateway. HTTP poll is fallback only.
 * Poll after the previous request finishes + this delay — never overlap.
 */
const POLL_MS = 5_000;
const POLL_MS_WHEN_WS = 45_000;
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
const PICKUP_ZONE_SOURCE_ID = "pickup-zone";
const PICKUP_ZONE_FILL_ID = "pickup-zone-fill";
const PICKUP_ZONE_STROKE_ID = "pickup-zone-stroke";
const DROP_ZONE_SOURCE_ID = "drop-zone";
const DROP_ZONE_FILL_ID = "drop-zone-fill";
const DROP_ZONE_STROKE_ID = "drop-zone-stroke";
const MAP_STYLE = "mapbox://styles/mapbox/standard";
/** Flat 2D day navigation — no 3D buildings / tilt. */
const MAP_INITIAL_ZOOM = 16;
const MAP_INITIAL_PITCH = 0;
const MAP_INITIAL_BEARING = 0;
const MAP_FIT_MAX_ZOOM = 17.5;
const SAME_POINT_METERS = 18;
/** Same off-route reroute threshold as customer / rider / merchant maps. */
const OFF_ROUTE_REROUTE_M = 45;
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

function projectOnLngLatSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-18) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return [a[0] + dx * t, a[1] + dy * t];
}

function closestPointOnLngLatRoute(
  route: [number, number][],
  rider: [number, number]
): { point: [number, number]; segmentIndex: number; distanceM: number } {
  if (route.length === 0) {
    return { point: rider, segmentIndex: 0, distanceM: 0 };
  }
  if (route.length === 1) {
    return {
      point: route[0]!,
      segmentIndex: 0,
      distanceM: haversineMeters(rider, route[0]!),
    };
  }
  let bestPoint = route[0]!;
  let bestSeg = 0;
  let bestDist = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const snap = projectOnLngLatSegment(rider, route[i]!, route[i + 1]!);
    const d = haversineMeters(rider, snap);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = snap;
      bestSeg = i;
    }
  }
  return { point: bestPoint, segmentIndex: bestSeg, distanceM: bestDist };
}

/** Remaining road polyline from rider snap → destination (customer / merchant live maps). */
function remainingRouteFromRider(
  full: [number, number][],
  rider: [number, number]
): { remaining: [number, number][]; offRouteM: number } {
  if (full.length < 2) {
    return { remaining: full.length ? [...full] : [rider], offRouteM: 0 };
  }
  const { point, segmentIndex, distanceM } = closestPointOnLngLatRoute(full, rider);
  const remaining: [number, number][] = [point, ...full.slice(segmentIndex + 1)];
  if (remaining.length < 2) {
    remaining.push(full[full.length - 1]!);
  }
  return { remaining, offRouteM: distanceM };
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

type PostPickupPhaseArgs = {
  orderStatus?: string | null;
  assignmentStatus?: string | null;
  pickedUpAt?: string | null;
  coreStatus?: string | null;
  foodOrderStatus?: string | null;
  dispatchedAt?: string | null;
  riderPickedUpAt?: string | null;
};

function isPostPickupPhase(args: PostPickupPhaseArgs): boolean {
  return isFoodPostPickupPhase({
    pickedUpAt: args.pickedUpAt,
    dispatchedAt: args.dispatchedAt,
    riderPickedUpAt: args.riderPickedUpAt,
    foodOrderStatus: args.foodOrderStatus,
    coreStatus: args.coreStatus,
    currentStatus: args.orderStatus ?? args.assignmentStatus,
  });
}

function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function lineStringFeature(coordinates: [number, number][]): GeoJSON.Feature | GeoJSON.FeatureCollection {
  const coords = (coordinates ?? []).filter(
    (c): c is [number, number] =>
      Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
  );
  if (coords.length < 2) return emptyFeatureCollection();
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords },
  };
}

function emptyPolygonFeature(): GeoJSON.FeatureCollection {
  return emptyFeatureCollection();
}

function ensureZoneLayers(
  map: any,
  sourceId: string,
  fillId: string,
  strokeId: string,
  beforeLayerId?: string
) {
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: "geojson", data: emptyPolygonFeature() });
  }
  if (!map.getLayer(fillId)) {
    map.addLayer(
      {
        id: fillId,
        type: "fill",
        source: sourceId,
        layout: { visibility: "none" },
        paint: {
          "fill-color": "#22c55e",
          "fill-opacity": 0.14,
        },
      },
      beforeLayerId
    );
  }
  if (!map.getLayer(strokeId)) {
    map.addLayer(
      {
        id: strokeId,
        type: "line",
        source: sourceId,
        layout: { visibility: "none" },
        paint: {
          "line-color": "#22c55e",
          "line-width": 1.5,
          "line-opacity": 0.35,
        },
      },
      beforeLayerId
    );
  }
}

function updateHighlightZone(
  map: any,
  sourceId: string,
  fillId: string,
  strokeId: string,
  center: [number, number] | null,
  visible: boolean
) {
  const src = map.getSource(sourceId);
  if (!src) return;
  if (!visible || !center) {
    src.setData(emptyPolygonFeature());
    map.setLayoutProperty(fillId, "visibility", "none");
    map.setLayoutProperty(strokeId, "visibility", "none");
    return;
  }
  src.setData(circlePolygonGeoJson(center[0], center[1], FOOD_DELIVERY_GEOFENCE_RADIUS_M));
  map.setLayoutProperty(fillId, "visibility", "visible");
  map.setLayoutProperty(strokeId, "visibility", "visible");
}

function routeStatusLabel(
  payload: OrderRiderTrackingPayload | null | undefined,
  riderId: number | null | undefined
): string {
  if (!payload?.location) {
    return riderId ? "Map ready · Awaiting GPS" : "Rider not assigned";
  }
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
  opts: PostPickupPhaseArgs & {
    store: [number, number] | null;
    drop: [number, number] | null;
    prevGps: [number, number] | null;
    routeBearingDeg: number | null;
  }
): [number, number] | null {
  const loc = payload?.location;
  if (!loc || !isValidLatLon(loc.latitude, loc.longitude)) return null;

  const postPickup = isPostPickupPhase(opts);
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
  phaseArgs: PostPickupPhaseArgs
): RouteEndpoints | null {
  const postPickup = isPostPickupPhase(phaseArgs);

  if (!rider) return null;

  const destination = postPickup ? drop : pickup;
  if (destination && !samePoint(rider, destination)) {
    return { from: rider, to: destination, mode: "live" };
  }

  return null;
}

function movementPhaseLabel(
  phaseArgs: PostPickupPhaseArgs,
  labels?: { pre?: string; post?: string }
): string {
  return isPostPickupPhase(phaseArgs)
    ? labels?.post ?? "Rider → customer"
    : labels?.pre ?? "Rider → restaurant";
}

async function fetchMapboxDrivingGeometry(
  from: [number, number],
  to: [number, number]
): Promise<{
  geometry: { type?: string; coordinates?: [number, number][] } | null;
  json: Record<string, unknown>;
  selectedRouteIndex: number;
}> {
  const token = getMapboxToken();
  if (!token) return { geometry: null, json: {}, selectedRouteIndex: 0 };

  // lng,lat order (Mapbox). alternatives=true so we never blindly take routes[0].
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${LIVE_RIDER_MAP_PROFILE}/` +
    `${from[0]},${from[1]};${to[0]},${to[1]}` +
    `?alternatives=true&overview=full&geometries=geojson&steps=true` +
    `&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url);
  const json = (await res.json()) as Record<string, unknown>;
  const routes = json.routes as
    | Array<{
        distance?: number;
        duration?: number;
        geometry?: { type?: string; coordinates?: [number, number][] };
        legs?: unknown[];
      }>
    | undefined;

  const selected = selectShortestPracticalRoute(
    routes,
    LIVE_RIDER_MAP_OPTIMIZE,
    LIVE_RIDER_MAP_PROFILE
  );
  logRouteSelectionDiagnostic("LiveRiderMap", from, to, selected);

  return {
    geometry: selected?.route.geometry ?? null,
    json,
    selectedRouteIndex: selected?.routeIndex ?? 0,
  };
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

/** Person-ride pickup — person silhouette instead of store/building. */
const PICKUP_PERSON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c1.2-3.5 3.6-5 6.5-5s5.3 1.5 6.5 5"/></svg>`;

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
  displayName?: string | null,
  storeIconStyle: "building" | "person" = "building"
) {
  pin.classList.add("gm-location-marker__pin--teardrop");
  const wrap = document.createElement("div");
  wrap.className = "gm-teardrop-pin";
  wrap.innerHTML = TEARDROP_PIN_SVG;

  const icon = document.createElement("div");
  icon.className = `gm-teardrop-pin__icon gm-teardrop-pin__icon--${variant}`;
  if (variant === "store") {
    icon.innerHTML = storeIconStyle === "person" ? PICKUP_PERSON_SVG : STORE_BUILDING_SVG;
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
  /** Food keeps building; person-ride uses person silhouette on pickup pin. */
  storeIconStyle?: "building" | "person";
}): HTMLDivElement {
  const {
    variant,
    label,
    name,
    labelOpen = false,
    headingDeg,
    storeIconStyle = "building",
  } = config;
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
    appendTeardropPin(pin, variant, displayName, storeIconStyle);
  }

  root.append(chip, pin);
  return root;
}

export default function RiderRouteMap({
  orderId,
  orderIdText = null,
  orderChannelIds,
  riderId,
  riderName,
  storeName,
  customerName,
  dropAddressFallback,
  merchantStoreLat,
  merchantStoreLon,
  pickupAddressGeocoded,
  orderStatus,
  coreStatus,
  foodOrderStatus,
  dispatchedAt,
  riderPickedUpAt,
  reachedMerchantAt,
  pickedUpAt,
  pickupLat,
  pickupLon,
  dropLat,
  dropLon,
  initialTracking = null,
  className = "",
  pickupLegendLabel = "Restaurant",
  dropLegendLabel = "Customer (after pickup)",
  prePickupMovementLabel = "Rider → restaurant",
  postPickupMovementLabel = "Rider → customer",
  alwaysShowDropMarker = false,
  pickupPinStyle = "building",
}: RiderRouteMapProps) {
  const resolvedOrderIdText = useMemo(() => {
    const fromProp = String(orderIdText ?? "").trim();
    if (fromProp) return fromProp.toUpperCase();
    if (orderId != null && Number.isFinite(orderId) && orderId > 0) {
      return `GMF${String(orderId).padStart(6, "0")}`;
    }
    return null;
  }, [orderIdText, orderId]);

  const isTerminalOrder = useMemo(() => {
    return [orderStatus, coreStatus, foodOrderStatus]
      .map((s) => String(s ?? "").toUpperCase())
      .some((s) =>
        ["DELIVERED", "CANCELLED", "FAILED", "REJECTED", "COMPLETED"].includes(s)
      );
  }, [orderStatus, coreStatus, foodOrderStatus]);

  const hasRiderAssignmentEarly =
    riderId != null && Number.isFinite(Number(riderId)) && Number(riderId) > 0;

  const stableChannelIds = useMemo(() => {
    const ids = [
      resolvedOrderIdText,
      ...(orderChannelIds ?? []),
    ]
      .map((id) => String(id ?? "").trim().toUpperCase())
      .filter((id) => /^[A-Z0-9-]{4,32}$/.test(id));
    return Array.from(new Set(ids));
  }, [resolvedOrderIdText, orderChannelIds?.join("|")]);

  const { liveFix, wsConnected } = useDashboardRiderLocation({
    orderIdText: resolvedOrderIdText,
    channelOrderIds: stableChannelIds,
    enabled: Boolean(hasRiderAssignmentEarly && !isTerminalOrder),
  });
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
        dispatchedAt ?? "",
        riderPickedUpAt ?? "",
        normalizeStatus(orderStatus),
        normalizeStatus(coreStatus),
        normalizeStatus(foodOrderStatus),
      ].join("|"),
    [coordKey, pickedUpAt, dispatchedAt, riderPickedUpAt, orderStatus, coreStatus, foodOrderStatus]
  );

  const phaseArgsRef = useRef<PostPickupPhaseArgs>({});
  phaseArgsRef.current = {
    orderStatus,
    pickedUpAt,
    coreStatus,
    foodOrderStatus,
    dispatchedAt,
    riderPickedUpAt,
  };

  const buildPhaseArgs = useCallback(
    (assignmentStatus?: string | null): PostPickupPhaseArgs => ({
      orderStatus,
      assignmentStatus,
      pickedUpAt,
      coreStatus,
      foodOrderStatus,
      dispatchedAt,
      riderPickedUpAt,
    }),
    [orderStatus, pickedUpAt, coreStatus, foodOrderStatus, dispatchedAt, riderPickedUpAt]
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
  const lastRouteGeometryRef = useRef<{ type?: string; coordinates?: [number, number][] } | null>(null);
  const lastRouteEndpointsRef = useRef<RouteEndpoints | null>(null);
  const lastDeliveryLegKeyRef = useRef<string | null>(null);
  const navFollowRef = useRef<NavigationFollowController | null>(null);
  const lastRouteProgressAlongRef = useRef(-1);
  const lastRouteProgressAtRef = useRef(0);
  const storeRef = useRef(storePoint);
  const dropRef = useRef(effectiveDrop);
  const storeNameRef = useRef(storeName);
  const customerNameRef = useRef(customerName);
  const alwaysShowDropMarkerRef = useRef(alwaysShowDropMarker);
  const pickupPinStyleRef = useRef(pickupPinStyle);
  const movementLabelsRef = useRef({
    pre: prePickupMovementLabel,
    post: postPickupMovementLabel,
  });
  const initStartedRef = useRef(false);

  storeRef.current = storePoint;
  dropRef.current = effectiveDrop;
  storeNameRef.current = storeName;
  customerNameRef.current = customerName;
  alwaysShowDropMarkerRef.current = alwaysShowDropMarker;
  pickupPinStyleRef.current = pickupPinStyle;
  movementLabelsRef.current = {
    pre: prePickupMovementLabel,
    post: postPickupMovementLabel,
  };

  const [containerReady, setContainerReady] = useState(false);
  const [followPaused, setFollowPaused] = useState(false);

  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    const ready = Boolean(node);
    queueMicrotask(() => {
      setContainerReady((prev) => (prev === ready ? prev : ready));
    });
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<OrderRiderTrackingPayload | null>(initialTracking);
  const [movementLabel, setMovementLabel] = useState(() =>
    routeStatusLabel(initialTracking, riderId)
  );
  const [routeSheetOpen, setRouteSheetOpen] = useState(false);
  const [routeSheet, setRouteSheet] = useState<RouteSheetData | null>(null);
  const [mapPainted, setMapPainted] = useState(false);

  trackingRef.current = tracking;

  // Parent may load /rider-tracking after mount — sync without remounting the map.
  useEffect(() => {
    if (!initialTracking) return;
    setTracking((prev) => {
      if (!prev?.location) return initialTracking;
      const prevMs = prev.location ? Date.parse(prev.location.updated_at) : 0;
      const nextMs = initialTracking.location
        ? Date.parse(initialTracking.location.updated_at)
        : 0;
      if (
        initialTracking.location &&
        Number.isFinite(nextMs) &&
        Number.isFinite(prevMs) &&
        nextMs >= prevMs
      ) {
        return initialTracking;
      }
      if (!initialTracking.location && prev.location) {
        return {
          ...initialTracking,
          location: prev.location,
          trail: initialTracking.trail?.length ? initialTracking.trail : prev.trail,
        };
      }
      return initialTracking;
    });
    setMovementLabel(
      routeStatusLabel(initialTracking, riderId) === "Live route"
        ? `Live route · ${movementPhaseLabel(
            buildPhaseArgs(initialTracking.rider?.assignment_status),
            movementLabelsRef.current
          )}`
        : routeStatusLabel(initialTracking, riderId)
    );
  }, [initialTracking, riderId, buildPhaseArgs]);

  const resolveRiderRouteAnchor = useCallback(
    (payload: OrderRiderTrackingPayload | null, assignmentStatus: string | null | undefined) =>
      resolveRiderRouteAnchorLngLat(payload, {
        ...buildPhaseArgs(assignmentStatus),
        store: storeRef.current,
        drop: dropRef.current,
        prevGps: prevRiderPosRef.current,
        routeBearingDeg: lastRouteBearingRef.current,
      }),
    [buildPhaseArgs]
  );

  const applyGeofenceHighlights = useCallback(
    (map: any, assignmentStatus: string | null | undefined) => {
      if (!mapReadyRef.current || !map) return;

      const phaseArgs = buildPhaseArgs(assignmentStatus);
      const postPickup = isPostPickupPhase(phaseArgs);
      const pickupPoint = storeRef.current;
      const dropPoint = dropRef.current;
      const loc = trackingRef.current?.location;
      const riderLat =
        loc && isValidLatLon(loc.latitude, loc.longitude) ? loc.latitude : null;
      const riderLng =
        loc && isValidLatLon(loc.latitude, loc.longitude) ? loc.longitude : null;

      const beforeLayer = map.getLayer(ROUTE_CASING_LAYER_ID)
        ? ROUTE_CASING_LAYER_ID
        : undefined;

      ensureZoneLayers(map, PICKUP_ZONE_SOURCE_ID, PICKUP_ZONE_FILL_ID, PICKUP_ZONE_STROKE_ID, beforeLayer);
      ensureZoneLayers(map, DROP_ZONE_SOURCE_ID, DROP_ZONE_FILL_ID, DROP_ZONE_STROKE_ID, beforeLayer);

      const highlightPickup =
        pickupPoint != null &&
        shouldHighlightPickupZone({
          postPickup,
          reachedMerchantAt,
          foodOrderStatus,
          riderLat,
          riderLng,
          pickupLat: pickupPoint[1],
          pickupLng: pickupPoint[0],
        });

      const highlightDrop =
        dropPoint != null &&
        shouldHighlightDropZone({
          postPickup,
          foodOrderStatus,
          currentStatus: orderStatus ?? assignmentStatus,
          riderLat,
          riderLng,
          dropLat: dropPoint[1],
          dropLng: dropPoint[0],
        });

      updateHighlightZone(
        map,
        PICKUP_ZONE_SOURCE_ID,
        PICKUP_ZONE_FILL_ID,
        PICKUP_ZONE_STROKE_ID,
        pickupPoint,
        highlightPickup
      );
      updateHighlightZone(
        map,
        DROP_ZONE_SOURCE_ID,
        DROP_ZONE_FILL_ID,
        DROP_ZONE_STROKE_ID,
        dropPoint,
        highlightDrop
      );
    },
    [buildPhaseArgs, reachedMerchantAt, foodOrderStatus, orderStatus]
  );

  const applyConnectorLines = useCallback(
    (
      map: any,
      geometry: { type?: string; coordinates?: [number, number][] },
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

      const postPickup = isPostPickupPhase(buildPhaseArgs(assignmentStatus));
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
    [buildPhaseArgs]
  );

  const applyRouteGeometry = useCallback(
    (map: any, geometry: { type?: string; coordinates?: [number, number][] }, mode: "live" | "planned") => {
      if (!geometry?.coordinates || geometry.coordinates.length < 2) return;
      const geojson = lineStringFeature(geometry.coordinates);
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
      if (!geometry?.coordinates || geometry.coordinates.length < 2) return;
      const geojson = lineStringFeature(geometry.coordinates);

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
    [buildPhaseArgs]
  );

  const fitMapToPoints = useCallback(
    (
      mapboxgl: any,
      map: any,
      riderPoint: [number, number] | null,
      assignmentStatus: string | null | undefined
    ) => {
      if (userControlsViewRef.current || boundsFittedRef.current) return;

      const postPickup = isPostPickupPhase(buildPhaseArgs(assignmentStatus));
      const bounds = new mapboxgl.LngLatBounds();
      let hasBounds = false;
      const storeLngLat = storeRef.current;
      const dropPoint = dropRef.current;
      // Always include store + drop so the basemap is useful before GPS arrives.
      if (storeLngLat) {
        bounds.extend(storeLngLat);
        hasBounds = true;
      }
      if (dropPoint) {
        bounds.extend(dropPoint);
        hasBounds = true;
      }
      if (riderPoint) {
        bounds.extend(riderPoint);
        hasBounds = true;
      }
      // Prefer destination-focused fit when we know phase and have a rider.
      if (!riderPoint && storeLngLat && dropPoint && !postPickup) {
        // keep both — overview while awaiting GPS
      }
      if (hasBounds) {
        // Flat 2D day navigation camera.
        map.fitBounds(bounds, {
          padding: 72,
          duration: 0,
          maxZoom: MAP_FIT_MAX_ZOOM,
          pitch: MAP_INITIAL_PITCH,
          bearing: MAP_INITIAL_BEARING,
        });
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
    [buildPhaseArgs]
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
        buildPhaseArgs(assignmentStatus)
      );

      if (!endpoints) {
        lastRouteGeometryRef.current = null;
        lastRouteEndpointsRef.current = null;
        lastRouteFromRef.current = null;
        lastRouteModeRef.current = null;
        if (map.getSource(ROUTE_SOURCE_ID)) {
          map.getSource(ROUTE_SOURCE_ID).setData(emptyFeatureCollection());
        }
        if (map.getSource(CONNECTOR_SOURCE_ID)) {
          map.getSource(CONNECTOR_SOURCE_ID).setData({ type: "FeatureCollection", features: [] });
        }
        return;
      }

      const destUnchanged =
        lastRouteEndpointsRef.current != null &&
        samePoint(lastRouteEndpointsRef.current.to, endpoints.to);
      const fullCoords = lastRouteGeometryRef.current?.coordinates;

      if (
        endpoints.mode === "live" &&
        destUnchanged &&
        fullCoords &&
        fullCoords.length >= 2
      ) {
        const { remaining, offRouteM } = remainingRouteFromRider(fullCoords, endpoints.from);
        if (offRouteM <= OFF_ROUTE_REROUTE_M && remaining.length >= 2) {
          applyRouteGeometry(map, { type: "LineString", coordinates: remaining }, "live");
          applyConnectorLines(
            map,
            { type: "LineString", coordinates: remaining },
            endpoints,
            riderRouteAnchor,
            assignmentStatus
          );
          navFollowRef.current?.setRoute(fullCoords);
          return;
        }
      }

      try {
        const { geometry, json, selectedRouteIndex } = await fetchMapboxDrivingGeometry(
          endpoints.from,
          endpoints.to
        );

        if (geometry?.coordinates?.length && mapReadyRef.current) {
          const coords = geometry.coordinates;
          if (coords.length >= 2) {
            lastRouteBearingRef.current = bearingDegreesLngLat(coords[0], coords[1]);
          }
          lastRouteGeometryRef.current = geometry;
          lastRouteEndpointsRef.current = endpoints;
          navFollowRef.current?.setRoute(coords);
          const displayCoords =
            endpoints.mode === "live"
              ? remainingRouteFromRider(coords, endpoints.from).remaining
              : coords;
          applyRouteGeometry(
            map,
            {
              type: "LineString",
              coordinates: displayCoords.length >= 2 ? displayCoords : coords,
            },
            endpoints.mode
          );
          applyConnectorLines(
            map,
            {
              type: "LineString",
              coordinates: displayCoords.length >= 2 ? displayCoords : coords,
            },
            endpoints,
            riderRouteAnchor,
            assignmentStatus
          );
          setRouteSheet(parseMapboxRouteSheet(json, selectedRouteIndex));
          lastRouteFromRef.current = endpoints.from;
          lastRouteModeRef.current = endpoints.mode;
        }
      } catch {
        /* route optional */
      }
    },
    [buildPhaseArgs, applyRouteGeometry, applyConnectorLines, clearDeliveryLegRoute]
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
    const phaseArgs = buildPhaseArgs(assignmentStatus);
    const postPickup = isPostPickupPhase(phaseArgs);
    const riderRouteAnchor = resolveRiderRouteAnchorLngLat(trackingRef.current, {
      ...phaseArgs,
      store: pickupPoint,
      drop: dropPoint,
      prevGps: prevRiderPosRef.current,
      routeBearingDeg: lastRouteBearingRef.current,
    });

    const pointEntries = [
      ...(pickupPoint ? [{ id: "store" as const, point: pickupPoint }] : []),
      ...((postPickup || alwaysShowDropMarkerRef.current) && dropPoint
        ? [{ id: "customer" as const, point: dropPoint }]
        : []),
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
      const existing = markersRef.current[kind];
      if (existing) {
        // Update in place — do not tear down DOM markers every GPS tick.
        existing.setLngLat(point);
        existing.setOffset(offset);
        return;
      }
      const el = createLocationMarkerElement({
        variant: kind,
        label,
        name,
        labelOpen: false,
        storeIconStyle: kind === "store" ? pickupPinStyleRef.current : "building",
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
      placeMarker(
        "store",
        pickupPoint,
        alwaysShowDropMarkerRef.current ? "Pickup" : "Store Location",
        storeNameRef.current
      );
    } else if (markersRef.current.store) {
      markersRef.current.store.remove();
      markersRef.current.store = undefined;
    }

    if ((postPickup || alwaysShowDropMarkerRef.current) && dropPoint) {
      placeMarker(
        "customer",
        dropPoint,
        alwaysShowDropMarkerRef.current ? "Drop" : "Customer",
        customerNameRef.current
      );
    } else if (markersRef.current.customer) {
      markersRef.current.customer.remove();
      markersRef.current.customer = undefined;
    }

    applyGeofenceHighlights(map, assignmentStatus ?? null);
  }, [buildPhaseArgs, applyGeofenceHighlights]);

  const fetchTracking = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/rider-tracking`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as OrderRiderTrackingPayload;

      setTracking((prev) => {
        const pollLoc = json.location;
        const curLoc = prev?.location;
        if (pollLoc && curLoc) {
          const pollMs = Date.parse(pollLoc.updated_at);
          const curMs = Date.parse(curLoc.updated_at);
          if (
            Number.isFinite(pollMs) &&
            Number.isFinite(curMs) &&
            curMs > pollMs &&
            curLoc.source === "live_location"
          ) {
            return {
              ...json,
              location: curLoc,
              trail:
                (json.trail?.length ?? 0) >= (prev?.trail?.length ?? 0)
                  ? json.trail
                  : (prev?.trail ?? json.trail),
            };
          }
        }
        if (!pollLoc && curLoc?.source === "live_location") {
          return { ...json, location: curLoc, trail: prev?.trail?.length ? prev.trail : json.trail };
        }
        return json;
      });

      const mergedLoc = json.location ?? trackingRef.current?.location ?? null;
      if (!mergedLoc) {
        setMovementLabel(riderId ? "Map ready · Awaiting GPS" : "Rider not assigned");
        if (!json.location) prevRiderPosRef.current = null;
        return;
      }

      const assignmentStatus =
        json.rider?.assignment_status ?? trackingRef.current?.rider?.assignment_status;
      setMovementLabel(
        `Live route · ${movementPhaseLabel(
          buildPhaseArgs(assignmentStatus),
          movementLabelsRef.current
        )}`
      );
    } catch {
      /* keep last tracking */
    }
  }, [orderId, riderId, buildPhaseArgs]);

  /** Merge realtime GPS from the same ws-gateway channel apps use. */
  useEffect(() => {
    if (!liveFix) return;
    if (!isValidLatLon(liveFix.latitude, liveFix.longitude)) return;

    setTracking((prev) => {
      const base: OrderRiderTrackingPayload = prev ?? {
        rider: {
          id: riderId ?? liveFix.riderId,
          name: riderName ?? null,
          mobile: null,
          selfie_url: null,
          assignment_status: null,
        },
        location: null,
        trail: [],
      };

      const prevLoc = base.location;
      if (prevLoc) {
        const prevMs = Date.parse(prevLoc.updated_at);
        const nextMs = Date.parse(liveFix.updatedAt);
        if (Number.isFinite(prevMs) && Number.isFinite(nextMs) && nextMs < prevMs) {
          return base;
        }
      }

      const nextLocation = {
        latitude: liveFix.latitude,
        longitude: liveFix.longitude,
        heading_degrees: liveFix.headingDegrees,
        updated_at: liveFix.updatedAt,
        source: "live_location" as const,
      };

      const trail = [...(base.trail ?? [])];
      const last = trail[trail.length - 1];
      if (
        !last ||
        haversineMeters(
          [last.longitude, last.latitude],
          [liveFix.longitude, liveFix.latitude]
        ) > 8
      ) {
        trail.push({
          latitude: liveFix.latitude,
          longitude: liveFix.longitude,
          created_at: liveFix.updatedAt,
        });
        if (trail.length > 80) trail.splice(0, trail.length - 80);
      } else {
        trail[trail.length - 1] = {
          latitude: liveFix.latitude,
          longitude: liveFix.longitude,
          created_at: liveFix.updatedAt,
        };
      }

      return {
        ...base,
        rider: {
          ...base.rider,
          id: base.rider.id ?? riderId ?? liveFix.riderId,
          name: base.rider.name ?? riderName ?? null,
        },
        location: nextLocation,
        trail,
      };
    });

    setMovementLabel(
      `Live route · ${movementPhaseLabel(
        buildPhaseArgs(trackingRef.current?.rider?.assignment_status ?? null),
        movementLabelsRef.current
      )}${wsConnected ? " · live" : ""}`
    );

    // Imperative nav update — do not wait on React re-render for smooth motion.
    queueMicrotask(() => {
      const nav = navFollowRef.current;
      if (!nav || !markersRef.current.rider) return;
      nav.pushGps({
        lngLat: [liveFix.longitude, liveFix.latitude],
        headingDeg: liveFix.headingDegrees,
        timestampMs: Date.parse(liveFix.updatedAt) || Date.now(),
        speedMps: liveFix.speedMps,
      });
      const rendered = nav.getRendered();
      if (rendered) lastRiderAnchorRef.current = rendered;
    });
  }, [liveFix, riderId, riderName, buildPhaseArgs, wsConnected]);

  const trackingPollInFlightRef = useRef(false);
  const wsConnectedRef = useRef(wsConnected);
  wsConnectedRef.current = wsConnected;

  useEffect(() => {
    if (!orderId) return;

    // Terminal: still load last-known GPS / trail once (do not leave "Awaiting GPS").
    if (isTerminalOrder) {
      void fetchTracking();
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (cancelled) return;
      const delay = wsConnectedRef.current ? POLL_MS_WHEN_WS : POLL_MS;
      timer = setTimeout(() => {
        void tick();
      }, delay);
    };

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        scheduleNext();
        return;
      }
      if (trackingPollInFlightRef.current) {
        scheduleNext();
        return;
      }
      trackingPollInFlightRef.current = true;
      try {
        await fetchTracking();
      } finally {
        trackingPollInFlightRef.current = false;
        scheduleNext();
      }
    };

    const onVisibility = () => {
      if (cancelled || document.hidden) return;
      if (timer != null) clearTimeout(timer);
      void tick();
    };

    // If parent already passed GPS, don't double-hit the API on mount —
    // schedule the first poll after the normal interval.
    const hasSeedGps = Boolean(
      initialTracking?.location || trackingRef.current?.location
    );
    if (hasSeedGps) {
      scheduleNext();
    } else {
      void tick();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [orderId, isTerminalOrder, fetchTracking, initialTracking?.location?.updated_at]);

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

    const geojson = lineStringFeature(trailCoords);
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

      const postPickup = isPostPickupPhase(buildPhaseArgs(assignmentStatus));
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
          ...buildPhaseArgs(assignmentStatus),
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
    [buildPhaseArgs]
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
      const postPickup = isPostPickupPhase(buildPhaseArgs(assignmentStatus));
      const offsets = overlapMarkerOffsets([
        ...(pickupPoint ? [{ id: "store", point: pickupPoint }] : []),
        ...((postPickup || alwaysShowDropMarkerRef.current) && dropPoint
          ? [{ id: "customer", point: dropPoint }]
          : []),
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
        lastRiderAnchorRef.current = riderRouteAnchor;

        // Attach navigation follow controller (marker + heading + camera).
        if (!navFollowRef.current) {
          navFollowRef.current = new NavigationFollowController({
            pitch: MAP_INITIAL_PITCH,
            lookAheadM: 70,
            cameraSmoothMs: 520,
          });
        }
        const nav = navFollowRef.current;
        nav.attach(map, markersRef.current.rider);
        const full = lastRouteGeometryRef.current?.coordinates ?? null;
        nav.setRoute(full);
        nav.setOnFollowChange((following) => {
          setFollowPaused(!following);
          userControlsViewRef.current = !following;
        });
        nav.setOnRouteProgress((_rem, alongM) => {
          const route = lastRouteGeometryRef.current?.coordinates;
          const mapInst = mapRef.current;
          if (!route || !mapInst || alongM < 0) return;
          const now = performance.now();
          // Tight throttle — green line should shrink every few frames like Google nav.
          if (
            now - lastRouteProgressAtRef.current < 32 &&
            Math.abs(alongM - lastRouteProgressAlongRef.current) < 1.25
          ) {
            return;
          }
          lastRouteProgressAtRef.current = now;
          lastRouteProgressAlongRef.current = alongM;
          const remaining = remainingFromAlong(route, alongM);
          if (remaining.length >= 2) {
            applyRouteGeometry(mapInst, { type: "LineString", coordinates: remaining }, "live");
          }
        });
        nav.seed({
          lngLat: [loc?.longitude ?? riderRouteAnchor[0], loc?.latitude ?? riderRouteAnchor[1]],
          headingDeg: headingDeg ?? null,
          timestampMs: loc ? Date.parse(loc.updated_at) || Date.now() : Date.now(),
          speedMps: null,
        });
      } else {
        markersRef.current.rider.setOffset(riderOffset);
        const nav = navFollowRef.current;
        if (nav && loc && isValidLatLon(loc.latitude, loc.longitude)) {
          // WS path pushes via liveFix effect (with speed). Poll path pushes here.
          if (loc.source !== "live_location") {
            nav.pushGps({
              lngLat: [loc.longitude, loc.latitude],
              headingDeg: loc.heading_degrees ?? headingDeg ?? null,
              timestampMs: Date.parse(loc.updated_at) || Date.now(),
              speedMps: null,
            });
            lastRiderAnchorRef.current = nav.getRendered() ?? riderRouteAnchor;
          }
        } else if (!nav) {
          // Fallback if controller missing.
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
      applyRouteGeometry,
      buildPhaseArgs,
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

    // While nav is interpolating along a cached route, do NOT re-trim from raw GPS
    // (that snaps the green line ahead of the marker). Progress callback owns the line.
    const nav = navFollowRef.current;
    const full = lastRouteGeometryRef.current?.coordinates;
    if (nav && full && full.length >= 2 && riderRouteAnchor) {
      const rendered = nav.getRendered();
      const checkPoint = (rendered ?? riderRouteAnchor) as [number, number];
      const { offRouteM } = remainingRouteFromRider(full, checkPoint);
      if (offRouteM <= OFF_ROUTE_REROUTE_M) {
        nav.setRoute(full);
        return;
      }
    }

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
  }, [routePhaseKey, syncPlaceMarkers, fitMapToPoints, resolveRiderRouteAnchor]);

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
      ...phaseArgsRef.current,
      assignmentStatus: trackingRef.current?.rider?.assignment_status,
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
    setMapPainted(false);
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
        // Prevent noisy `ERR_BLOCKED_BY_CLIENT` for events.mapbox.com telemetry.
        try {
          const { disableMapboxTelemetry } = await import("@/lib/mapbox/disable-telemetry");
          disableMapboxTelemetry();
        } catch { /* non-fatal */ }

        const map = new mapboxgl.Map({
          container,
          style: MAP_STYLE,
          center: mapCenter,
          zoom: MAP_INITIAL_ZOOM,
          pitch: MAP_INITIAL_PITCH,
          bearing: MAP_INITIAL_BEARING,
          // Flat 2D mercator — navigation screen (no 3D tilt).
          projection: "mercator",
          maxPitch: 0,
          pitchWithRotate: false,
          attributionControl: true,
          accessToken: token,
        });

        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "top-left");

        const enableDayNavBasemap = () => {
          try {
            // Day mode 2D navigation — no 3D buildings/landmarks/trees.
            map.setConfigProperty("basemap", "show3dObjects", false);
            map.setConfigProperty("basemap", "lightPreset", "day");
            map.setConfigProperty("basemap", "theme", "default");
            map.setConfigProperty("basemap", "showPointOfInterestLabels", true);
            map.setConfigProperty("basemap", "showPlaceLabels", true);
            map.setConfigProperty("basemap", "showRoadLabels", true);
            map.setConfigProperty("basemap", "showTransitLabels", true);
          } catch {
            /* style may not expose basemap config yet */
          }
          try {
            map.easeTo({
              pitch: MAP_INITIAL_PITCH,
              duration: 0,
            });
          } catch {
            /* ignore */
          }
        };
        map.on("style.load", enableDayNavBasemap);

        const lockUserView = (e?: { originalEvent?: unknown }) => {
          if (e?.originalEvent != null) {
            userControlsViewRef.current = true;
            navFollowRef.current?.notifyUserGesture();
            setFollowPaused(true);
          }
        };
        map.on("dragstart", lockUserView);
        map.on("zoomstart", lockUserView);
        map.on("rotatestart", lockUserView);
        map.on("pitchstart", lockUserView);

        map.on("load", () => {
          if (cancelled) return;
          mapReadyRef.current = true;
          setMapPainted(true);
          enableDayNavBasemap();

          syncPlaceMarkersRef.current(mapboxgl, map);
          updateRiderOnMapRef.current(mapboxgl, map, trackingRef.current);

          const riderRouteAnchor = resolveRiderRouteAnchorLngLat(trackingRef.current, {
            ...phaseArgsRef.current,
            assignmentStatus: trackingRef.current?.rider?.assignment_status,
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
          // fitBounds can race style load — re-apply day 2D camera after fit.
          enableDayNavBasemap();

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
          const isModelError =
            msg.includes("Could not load model") || msg.includes(".glb");
          const isGeoJsonError = /valid GeoJSON|GeoJSON object/i.test(msg);
          if (msg && !cancelled && !isTileError && !isModelError && !isGeoJsonError) {
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
      navFollowRef.current?.destroy();
      navFollowRef.current = null;
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
  const mapPostPickup = isPostPickupPhase(phaseArgsRef.current);

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
          {pickupLegendLabel}
        </span>
        {mapPostPickup || alwaysShowDropMarker ? (
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[7px] font-bold text-white">
              CX
            </span>
            {dropLegendLabel}
          </span>
        ) : null}
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
            className="h-3 w-3 rounded-full border border-emerald-400 bg-emerald-400/20"
          />
          200m highlight zone
        </span>
      </div>

      <div className="relative flex-1 min-h-[280px] h-[280px] w-full bg-[#eef2f6]">
        {error ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 text-center">
            {error}
          </div>
        ) : null}
        {!error && !mapPainted ? (
          <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center rounded bg-[#eef2f6]">
            <div className="text-[11px] font-medium text-slate-500">Loading map…</div>
          </div>
        ) : null}
        <div
          ref={containerRefCallback}
          className="absolute inset-0 h-full w-full rounded border border-gray-200 bg-[#eef2f6] [&_.mapboxgl-canvas]:!w-full [&_.mapboxgl-canvas]:!h-full [&_.mapboxgl-ctrl-bottom-left]:hidden"
        />

            {followPaused && hasRiderAssignment && !isTerminalOrder ? (
              <button
                type="button"
                onClick={() => {
                  userControlsViewRef.current = false;
                  setFollowPaused(false);
                  navFollowRef.current?.resumeFollow();
                }}
                className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-800 shadow-md hover:bg-emerald-50"
              >
                Resume Rider
              </button>
            ) : null}

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
