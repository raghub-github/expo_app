'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type {
  MerchantMapPin,
  MerchantRiderTrackingLocation,
  MerchantRiderTrackingTrailPoint,
} from '@/lib/merchant-rider-tracking';
import {
  bearingDegreesLngLat,
  resolveRiderFrontWheelLngLat,
} from '@/lib/map-rider-route-anchor';
import { isValidLatLon, toMapLngLat } from '@/lib/parse-order-map-coords';
import {
  fetchAndCacheDrivingRoute,
  getCachedDrivingRoute,
} from '@/lib/merchant-mapbox-route-cache';
import {
  createMerchantRiderMarkerElement,
  createMerchantStoreMarkerElementWithLabelState,
  isMerchantStoreLabelOpen,
  setMerchantRiderBikeHeading,
} from '@/components/orders/merchant-rider-map-markers';

const ROUTE_SOURCE_ID = 'merchant-active-route';
const ROUTE_CASING_LAYER_ID = 'merchant-active-route-casing';
const ROUTE_LAYER_ID = 'merchant-active-route-line';
const CONNECTOR_SOURCE_ID = 'merchant-route-connectors';
const CONNECTOR_CASING_LAYER_ID = 'merchant-route-connectors-casing';
const CONNECTOR_LAYER_ID = 'merchant-route-connectors-line';
const ROUTE_GREEN = '#22c55e';
const ROUTE_GREEN_CASING = '#ffffff';
const ROUTE_LIVE_LINE_WIDTH = 4;
const ROUTE_LIVE_CASING_WIDTH = 7;
const SAME_POINT_METERS = 18;
const ROUTE_REFRESH_METERS = 35;
const CONNECTOR_MIN_METERS = 6;
const RIDER_ANIM_MIN_MS = 400;
const RIDER_ANIM_MAX_MS = 2800;
const RIDER_ANIM_MIN_DIST_M = 0.35;

export const MERCHANT_RIDER_MAP_POLL_MS = 2000;

type MerchantRiderLiveMapProps = {
  location: MerchantRiderTrackingLocation | null;
  store: MerchantMapPin | null;
  storeName?: string | null;
  trail?: MerchantRiderTrackingTrailPoint[];
  /** When modal becomes visible, resize map so tiles/markers render immediately. */
  visible?: boolean;
  className?: string;
};

function pinToLngLat(pin: MerchantMapPin): [number, number] {
  return [pin.longitude, pin.latitude];
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

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function riderAnimationDurationMs(distanceM: number): number {
  const scaled = distanceM * 48;
  return Math.round(Math.min(RIDER_ANIM_MAX_MS, Math.max(RIDER_ANIM_MIN_MS, scaled)));
}

function getMarkerLngLat(marker: mapboxgl.Marker): [number, number] | null {
  try {
    const ll = marker.getLngLat();
    if (!Number.isFinite(ll.lng) || !Number.isFinite(ll.lat)) return null;
    return [ll.lng, ll.lat];
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

function fitMapToCoords(map: mapboxgl.Map, coords: [number, number][], singleZoom = 15) {
  if (coords.length === 0) return;
  if (coords.length === 1) {
    map.easeTo({ center: coords[0], zoom: singleZoom, duration: 700 });
    return;
  }
  const bounds = new mapboxgl.LngLatBounds();
  for (const c of coords) bounds.extend(c);
  map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 700 });
}

export function MerchantRiderLiveMap({
  location,
  store,
  storeName,
  trail = [],
  visible = true,
  className = '',
}: MerchantRiderLiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const riderMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const storeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const prevGpsRef = useRef<[number, number] | null>(null);
  const lastRiderAnchorRef = useRef<[number, number] | null>(null);
  const lastTrailAnimatedIndexRef = useRef(0);
  const lastRouteFromRef = useRef<[number, number] | null>(null);
  const lastRouteGeometryRef = useRef<[number, number][] | null>(null);
  const lastRouteBearingRef = useRef<number | null>(null);
  const riderAnimFrameRef = useRef<number | null>(null);
  const riderMoveQueueRef = useRef<[number, number][]>([]);
  const riderMovePlayingRef = useRef(false);
  const boundsFittedRef = useRef(false);

  const storeRef = useRef<[number, number] | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? '';

  storeRef.current = store ? pinToLngLat(store) : null;

  const cancelRiderAnimation = useCallback(() => {
    if (riderAnimFrameRef.current != null) {
      cancelAnimationFrame(riderAnimFrameRef.current);
      riderAnimFrameRef.current = null;
    }
  }, []);

  const ensureRouteLayers = useCallback((map: mapboxgl.Map) => {
    if (!map.getSource(ROUTE_SOURCE_ID)) {
      map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      });
      map.addLayer({
        id: ROUTE_CASING_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ROUTE_GREEN_CASING, 'line-width': ROUTE_LIVE_CASING_WIDTH, 'line-opacity': 1 },
      });
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ROUTE_GREEN, 'line-width': ROUTE_LIVE_LINE_WIDTH, 'line-opacity': 0.95 },
      });
    }
    if (!map.getSource(CONNECTOR_SOURCE_ID)) {
      map.addSource(CONNECTOR_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: CONNECTOR_CASING_LAYER_ID,
        type: 'line',
        source: CONNECTOR_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ROUTE_GREEN_CASING, 'line-width': 5, 'line-opacity': 1 },
      });
      map.addLayer({
        id: CONNECTOR_LAYER_ID,
        type: 'line',
        source: CONNECTOR_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ROUTE_GREEN,
          'line-width': 2.5,
          'line-opacity': 0.95,
          'line-dasharray': [1.2, 1.8],
        },
      });
    }
  }, []);

  const applyRouteGeometry = useCallback((map: mapboxgl.Map, coords: [number, number][]) => {
    const src = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!src || coords.length < 2) {
      src?.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [] },
      });
      return;
    }
    lastRouteBearingRef.current = bearingDegreesLngLat(coords[0], coords[1]);
    src.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    });
  }, []);

  const applyConnectorLines = useCallback(
    (
      map: mapboxgl.Map,
      routeCoords: [number, number][],
      riderAnchor: [number, number] | null,
      storeLngLat: [number, number] | null
    ) => {
      const src = map.getSource(CONNECTOR_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (!src || routeCoords.length < 2) {
        src?.setData({ type: 'FeatureCollection', features: [] });
        return;
      }

      const routeStart = routeCoords[0]!;
      const routeEnd = routeCoords[routeCoords.length - 1]!;
      const segments: Array<{ from: [number, number]; to: [number, number] }> = [];

      const pushSegment = (from: [number, number], to: [number, number]) => {
        if (haversineMeters(from, to) < CONNECTOR_MIN_METERS) return;
        segments.push({ from, to });
      };

      if (storeLngLat) pushSegment(routeEnd, storeLngLat);
      if (riderAnchor) pushSegment(riderAnchor, routeStart);

      src.setData({
        type: 'FeatureCollection',
        features: segments.map((seg, index) => ({
          type: 'Feature',
          properties: { id: index },
          geometry: { type: 'LineString', coordinates: [seg.from, seg.to] },
        })),
      });
    },
    []
  );

  const fetchDrivingRoute = useCallback(
    async (from: [number, number], to: [number, number]): Promise<[number, number][] | null> => {
      if (!token || samePoint(from, to)) return null;

      const cached = getCachedDrivingRoute(from, to);
      if (cached?.length) {
        lastRouteFromRef.current = from;
        lastRouteGeometryRef.current = cached;
        return cached;
      }

      const moved = lastRouteFromRef.current
        ? haversineMeters(lastRouteFromRef.current, from)
        : Number.POSITIVE_INFINITY;
      if (moved < ROUTE_REFRESH_METERS && lastRouteGeometryRef.current?.length) {
        return lastRouteGeometryRef.current;
      }

      const coords = await fetchAndCacheDrivingRoute(from, to);
      if (coords?.length) {
        lastRouteFromRef.current = from;
        lastRouteGeometryRef.current = coords;
        return coords;
      }
      return null;
    },
    [token]
  );

  const resolveRiderAnchor = useCallback((): [number, number] | null => {
    if (!location || !isValidLatLon(location.latitude, location.longitude)) return null;
    return resolveRiderFrontWheelLngLat({
      latitude: location.latitude,
      longitude: location.longitude,
      heading_degrees: location.heading_degrees,
      prevGps: prevGpsRef.current,
      destination: storeRef.current,
      routeBearingDeg: lastRouteBearingRef.current,
    });
  }, [location]);

  const animateRiderTo = useCallback(
    (marker: mapboxgl.Marker, to: [number, number], headingDeg: number | null | undefined) =>
      new Promise<void>((resolve) => {
        const from = getMarkerLngLat(marker) ?? lastRiderAnchorRef.current ?? to;
        const dist = haversineMeters(from, to);
        setMerchantRiderBikeHeading(marker, headingDeg);

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
      }),
    [cancelRiderAnimation]
  );

  const pumpRiderMoveQueue = useCallback(
    async (marker: mapboxgl.Marker, headingDeg: number | null | undefined) => {
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
    (marker: mapboxgl.Marker, waypoints: [number, number][], headingDeg: number | null | undefined) => {
      if (!waypoints.length) return;
      riderMoveQueueRef.current.push(...waypoints);
      void pumpRiderMoveQueue(marker, headingDeg);
    },
    [pumpRiderMoveQueue]
  );

  const buildMovementWaypoints = useCallback((): [number, number][] => {
    const destination = storeRef.current;
    const out: [number, number][] = [];
    const startIdx = lastTrailAnimatedIndexRef.current;

    for (let i = startIdx; i < trail.length; i++) {
      const p = trail[i]!;
      const prevGps =
        i > 0
          ? ([trail[i - 1]!.longitude, trail[i - 1]!.latitude] as [number, number])
          : prevGpsRef.current;
      const next = trail[i + 1];
      const routeBearing =
        next != null
          ? bearingDegreesLngLat([p.longitude, p.latitude], [next.longitude, next.latitude])
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
      const last =
        out[out.length - 1] ??
        (riderMarkerRef.current ? getMarkerLngLat(riderMarkerRef.current) : null) ??
        lastRiderAnchorRef.current;
      if (!last || haversineMeters(last, anchor) >= RIDER_ANIM_MIN_DIST_M) {
        out.push(anchor);
      }
    }

    lastTrailAnimatedIndexRef.current = trail.length;

    if (location && isValidLatLon(location.latitude, location.longitude)) {
      const liveAnchor = resolveRiderAnchor();
      if (liveAnchor) {
        const last = out[out.length - 1] ?? lastRiderAnchorRef.current;
        if (!last || haversineMeters(last, liveAnchor) >= RIDER_ANIM_MIN_DIST_M) {
          out.push(liveAnchor);
        }
      }
    }

    return out;
  }, [trail, location, resolveRiderAnchor]);

  const paintRoute = useCallback(
    (
      map: mapboxgl.Map,
      coords: [number, number][] | null,
      riderAnchor: [number, number],
      storeLngLat: [number, number]
    ) => {
      if (coords && coords.length >= 2) {
        applyRouteGeometry(map, coords);
        applyConnectorLines(map, coords, riderAnchor, storeLngLat);
        fitMapToCoords(map, coords);
        boundsFittedRef.current = true;
      } else {
        applyRouteGeometry(map, []);
        applyConnectorLines(map, [], riderAnchor, storeLngLat);
      }
    },
    [applyRouteGeometry, applyConnectorLines]
  );

  const loadCalculatedRoute = useCallback(
    async (map: mapboxgl.Map, riderAnchor: [number, number], storeLngLat: [number, number]) => {
      if (samePoint(riderAnchor, storeLngLat)) {
        applyRouteGeometry(map, []);
        applyConnectorLines(map, [], riderAnchor, storeLngLat);
        return;
      }

      const cached = getCachedDrivingRoute(riderAnchor, storeLngLat);
      if (cached?.length) {
        lastRouteFromRef.current = riderAnchor;
        lastRouteGeometryRef.current = cached;
        paintRoute(map, cached, riderAnchor, storeLngLat);
      }

      const coords = await fetchDrivingRoute(riderAnchor, storeLngLat);
      if (!mapRef.current) return;
      paintRoute(map, coords, riderAnchor, storeLngLat);
    },
    [fetchDrivingRoute, paintRoute, applyRouteGeometry, applyConnectorLines]
  );

  useEffect(() => {
    if (!containerRef.current || !token) return;

    mapboxgl.accessToken = token;
    const storeLngLat = storeRef.current;
    const gps = location ? toMapLngLat(location.latitude, location.longitude) : null;
    const riderAnchor = gps && storeLngLat ? resolveRiderFrontWheelLngLat({
      latitude: location!.latitude,
      longitude: location!.longitude,
      heading_degrees: location!.heading_degrees,
      destination: storeLngLat,
    }) : gps;
    const initialCenter = riderAnchor ?? storeLngLat ?? ([78.9629, 20.5937] as [number, number]);
    const initialZoom = riderAnchor || storeLngLat ? 15 : 4;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    setMapReady(false);
    boundsFittedRef.current = false;
    lastRouteFromRef.current = null;
    lastRouteGeometryRef.current = null;
    lastTrailAnimatedIndexRef.current = 0;

    map.on('load', () => {
      ensureRouteLayers(map);
      setMapReady(true);
    });

    return () => {
      cancelRiderAnimation();
      riderMarkerRef.current?.remove();
      storeMarkerRef.current?.remove();
      riderMarkerRef.current = null;
      storeMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [token, ensureRouteLayers, cancelRiderAnimation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const storeLngLat = storeRef.current;
    const riderAnchor = resolveRiderAnchor();
    const gps =
      location && isValidLatLon(location.latitude, location.longitude)
        ? ([location.longitude, location.latitude] as [number, number])
        : null;

    const storeLabelWasOpen = isMerchantStoreLabelOpen(storeMarkerRef.current);
    if (storeLngLat) {
      const storeEntries = [{ id: 'store', point: storeLngLat }];
      const offsets = overlapMarkerOffsets(
        riderAnchor
          ? [...storeEntries, { id: 'rider', point: riderAnchor }]
          : storeEntries
      );
      const storeOffset = offsets.get('store') ?? [0, 0];
      if (!storeMarkerRef.current) {
        storeMarkerRef.current = new mapboxgl.Marker({
          element: createMerchantStoreMarkerElementWithLabelState(storeName, storeLabelWasOpen),
          anchor: 'bottom',
          offset: storeOffset,
        })
          .setLngLat(storeLngLat)
          .addTo(map);
      } else {
        storeMarkerRef.current.setLngLat(storeLngLat);
        storeMarkerRef.current.setOffset(storeOffset);
      }
    } else if (storeMarkerRef.current) {
      storeMarkerRef.current.remove();
      storeMarkerRef.current = null;
    }

    if (!riderAnchor || !gps) {
      riderMarkerRef.current?.remove();
      riderMarkerRef.current = null;
      applyRouteGeometry(map, []);
      const conn = map.getSource(CONNECTOR_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      conn?.setData({ type: 'FeatureCollection', features: [] });
      if (storeLngLat && !boundsFittedRef.current) {
        fitMapToCoords(map, [storeLngLat]);
        boundsFittedRef.current = true;
      }
      return;
    }

    const hadRider = Boolean(lastRiderAnchorRef.current);
    if (!hadRider) {
      boundsFittedRef.current = false;
    }

    let headingDeg = location?.heading_degrees ?? null;
    if (headingDeg == null && prevGpsRef.current) {
      headingDeg = bearingDegreesLngLat(prevGpsRef.current, gps);
    }

    const offsets = overlapMarkerOffsets([
      ...(storeLngLat ? [{ id: 'store', point: storeLngLat }] : []),
      { id: 'rider', point: riderAnchor },
    ]);
    const riderOffset = offsets.get('rider') ?? [0, 0];

    if (!riderMarkerRef.current) {
      riderMarkerRef.current = new mapboxgl.Marker({
        element: createMerchantRiderMarkerElement(headingDeg),
        anchor: 'center',
        offset: riderOffset,
      })
        .setLngLat(riderAnchor)
        .addTo(map);
      lastTrailAnimatedIndexRef.current = trail.length;
    } else {
      riderMarkerRef.current.setOffset(riderOffset);
      const waypoints = buildMovementWaypoints();
      if (waypoints.length > 0) {
        queueRiderMovement(riderMarkerRef.current, waypoints, headingDeg);
      } else {
        riderMarkerRef.current.setLngLat(riderAnchor);
        setMerchantRiderBikeHeading(riderMarkerRef.current, headingDeg);
      }
    }

    prevGpsRef.current = gps;
    lastRiderAnchorRef.current = riderAnchor;

    if (storeLngLat) {
      void loadCalculatedRoute(map, riderAnchor, storeLngLat);
    } else if (!boundsFittedRef.current) {
      fitMapToCoords(map, [riderAnchor]);
      boundsFittedRef.current = true;
    }
  }, [
    location,
    store,
    storeName,
    trail,
    mapReady,
    resolveRiderAnchor,
    buildMovementWaypoints,
    queueRiderMovement,
    loadCalculatedRoute,
    applyRouteGeometry,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !visible) return;
    const run = () => {
      map.resize();
      const storeLngLat = storeRef.current;
      const riderAnchor = resolveRiderAnchor();
      if (riderAnchor && storeLngLat) {
        void loadCalculatedRoute(map, riderAnchor, storeLngLat);
      }
    };
    run();
    const id = window.requestAnimationFrame(run);
    return () => window.cancelAnimationFrame(id);
  }, [visible, mapReady, location, store, resolveRiderAnchor, loadCalculatedRoute]);

  if (!token) {
    return (
      <div
        className={`flex h-full min-h-[220px] items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-600 ${className}`}
      >
        Map unavailable — add NEXT_PUBLIC_MAPBOX_TOKEN
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`h-full min-h-[240px] w-full overflow-hidden rounded-xl ${className}`}
    />
  );
}
