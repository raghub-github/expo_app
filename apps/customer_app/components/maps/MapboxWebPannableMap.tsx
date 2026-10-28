// @ts-nocheck — native Mapbox module is loaded via require()
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { getConfig } from "@/config/env";
import { buildPannableMapHtml } from "@/components/maps/mapbox-web-pannable-html";
import { latitudeDeltaToZoom } from "@/components/maps/mapbox-web-shared";
import { CustomerMapUnavailable } from "@/components/maps/CustomerMapUnavailable";
import type { CustomerMapRef } from "@/lib/customer-map-handle";
import { isValidMapCoordinate } from "@/lib/map-coordinates";
import {
  NATIVE_MAP_STYLE,
  SnapDot,
  circlePolygon,
  nativeMapUnavailableReason,
  renderNativeMarker,
  useCustomerNativeMapbox,
} from "@/components/maps/native-map-shared";

const FALLBACK_REGION: MapRegion = {
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

function safeMapRegion(region: MapRegion): MapRegion {
  if (isValidMapCoordinate(region.latitude, region.longitude)) return region;
  return FALLBACK_REGION;
}

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta?: number;
  longitudeDelta?: number;
};

export type SnapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  selected?: boolean;
};

type Props = {
  initialRegion: MapRegion;
  circleRadiusMeters?: number;
  snapPoints?: SnapPoint[];
  onRegionChange?: (region: MapRegion) => void;
  onRegionChangeComplete?: (region: MapRegion) => void;
  onSnapPointPress?: (id: string) => void;
  onMapReady?: () => void;
  style?: object;
};

/** Expo Go / no native Mapbox — Mapbox GL JS in WebView so pin pan + locate still work. */
const MapboxWebPannableMapWebFallback = forwardRef<CustomerMapRef, Props>(
  function MapboxWebPannableMapWebFallback(
    {
      initialRegion,
      circleRadiusMeters,
      snapPoints = [],
      onRegionChange,
      onRegionChangeComplete,
      onSnapPointPress,
      onMapReady,
      style,
    },
    ref
  ) {
    const webRef = useRef<WebView>(null);
    const readyRef = useRef(false);
    const pointWaiters = useRef(
      new Map<number, (value: { x: number; y: number } | null) => void>()
    );
    const pointSeq = useRef(0);
    const ignoreUntilMsRef = useRef(0);

    const token = getConfig().mapboxAccessToken?.trim() ?? "";
    const origin = safeMapRegion(initialRegion);
    const originRef = useRef({
      latitude: origin.latitude,
      longitude: origin.longitude,
      latitudeDelta: origin.latitudeDelta ?? 0.01,
    });

    const html = useMemo(() => {
      if (!token) return "";
      const o = originRef.current;
      return buildPannableMapHtml(
        token,
        { latitude: o.latitude, longitude: o.longitude },
        {
          latitudeDelta: o.latitudeDelta,
          circleRadiusMeters,
        }
      );
      // Keep first camera; later moves use animateToRegion so panning does not reload WebView.
    }, [token, circleRadiusMeters]);

    const injectSnapPoints = useCallback(() => {
      if (!readyRef.current) return;
      const json = JSON.stringify(snapPoints);
      webRef.current?.injectJavaScript(
        `window.updateSnapPoints && window.updateSnapPoints(${json}); true;`
      );
    }, [snapPoints]);

    useImperativeHandle(
      ref,
      () => ({
        pointForCoordinate: (coord) =>
          new Promise((resolve) => {
            if (!readyRef.current) {
              resolve(null);
              return;
            }
            const requestId = ++pointSeq.current;
            pointWaiters.current.set(requestId, resolve);
            webRef.current?.injectJavaScript(
              `window.projectPoint && window.projectPoint(${coord.latitude}, ${coord.longitude}, ${requestId}); true;`
            );
            setTimeout(() => {
              if (pointWaiters.current.has(requestId)) {
                pointWaiters.current.delete(requestId);
                resolve(null);
              }
            }, 1200);
          }),
        fitToCoordinates: () => {
          /* not used on pannable maps */
        },
        animateToRegion: (region: MapRegion) => {
          if (!readyRef.current) return;
          const next = safeMapRegion(region);
          ignoreUntilMsRef.current = Date.now() + 420;
          const zoom = latitudeDeltaToZoom(next.latitudeDelta ?? 0.01);
          webRef.current?.injectJavaScript(
            `window.flyToCenter && window.flyToCenter(${next.latitude}, ${next.longitude}, ${zoom}); true;`
          );
        },
      }),
      []
    );

    useEffect(() => {
      injectSnapPoints();
    }, [injectSnapPoints]);

    const onMessage = useCallback(
      (event: WebViewMessageEvent) => {
        try {
          const msg = JSON.parse(event.nativeEvent.data) as {
            type?: string;
            phase?: string;
            latitude?: number;
            longitude?: number;
            id?: string;
            requestId?: number;
            x?: number;
            y?: number;
            error?: boolean;
          };

          if (msg.type === "point" && msg.requestId != null) {
            const resolve = pointWaiters.current.get(msg.requestId);
            if (resolve) {
              pointWaiters.current.delete(msg.requestId);
              if (msg.error || msg.x == null || msg.y == null) resolve(null);
              else resolve({ x: msg.x, y: msg.y });
            }
            return;
          }

          if (msg.type === "region" && msg.latitude != null && msg.longitude != null) {
            if (!isValidMapCoordinate(msg.latitude, msg.longitude)) return;
            if (Date.now() < ignoreUntilMsRef.current && msg.phase !== "complete") return;
            const region: MapRegion = {
              latitude: msg.latitude,
              longitude: msg.longitude,
            };
            if (msg.phase === "complete") onRegionChangeComplete?.(region);
            else onRegionChange?.(region);
            return;
          }

          if (msg.type === "snap" && msg.id) {
            onSnapPointPress?.(msg.id);
            return;
          }

          if (msg.type === "ready") {
            readyRef.current = true;
            injectSnapPoints();
            onMapReady?.();
          }
        } catch {
          /* ignore */
        }
      },
      [injectSnapPoints, onMapReady, onRegionChange, onRegionChangeComplete, onSnapPointPress]
    );

    if (!token || !html) {
      return <CustomerMapUnavailable style={style} />;
    }

    return (
      <View style={[styles.fill, style]}>
        <WebView
          ref={webRef}
          source={{ html }}
          style={styles.fill}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          onMessage={onMessage}
          mixedContentMode="always"
          allowsInlineMediaPlayback
          setSupportMultipleWindows={false}
        />
      </View>
    );
  }
);

const MapboxWebPannableMapNative = forwardRef<CustomerMapRef, Props>(
  function MapboxWebPannableMapNative(
    {
      initialRegion,
      circleRadiusMeters,
      snapPoints = [],
      onRegionChange,
      onRegionChangeComplete,
      onSnapPointPress,
      onMapReady,
      style,
    },
    ref
  ) {
    const Mapbox = useCustomerNativeMapbox();
    const mapRef = useRef(null);
    const cameraRef = useRef(null);
    const readyRef = useRef(false);
    const [mapReady, setMapReady] = useState(false);
    const lastPostedRef = useRef<{ lat: number; lng: number } | null>(null);
    const ignoreUntilMsRef = useRef(0);
    const origin = safeMapRegion(initialRegion);
    const originRef = useRef({
      latitude: origin.latitude,
      longitude: origin.longitude,
      zoom: latitudeDeltaToZoom(origin.latitudeDelta ?? 0.01),
    });

    const postRegion = useCallback(
      (phase: "change" | "complete", lat: number, lng: number) => {
        if (!readyRef.current) return;
        if (!isValidMapCoordinate(lat, lng)) return;
        if (Date.now() < ignoreUntilMsRef.current) return;
        if (phase === "change" && lastPostedRef.current) {
          const dLat = Math.abs(lat - lastPostedRef.current.lat);
          const dLng = Math.abs(lng - lastPostedRef.current.lng);
          if (dLat < 4e-5 && dLng < 4e-5) return;
        }
        lastPostedRef.current = { lat, lng };
        const region: MapRegion = { latitude: lat, longitude: lng };
        if (phase === "complete") onRegionChangeComplete?.(region);
        else onRegionChange?.(region);
      },
      [onRegionChange, onRegionChangeComplete]
    );

    const readMapCenter = (e: {
      properties?: { center?: number[]; centerCoordinate?: number[] };
      geometry?: { coordinates?: number[] };
    } | null) => {
      const c =
        e?.properties?.center ??
        e?.properties?.centerCoordinate ??
        null;
      if (Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        return { lng: Number(c[0]), lat: Number(c[1]) };
      }
      const g = e?.geometry?.coordinates;
      if (Array.isArray(g) && g.length >= 2 && Number.isFinite(g[0]) && Number.isFinite(g[1])) {
        return { lng: Number(g[0]), lat: Number(g[1]) };
      }
      return null;
    };

    useImperativeHandle(
      ref,
      () => ({
        pointForCoordinate: async (coord) => {
          try {
            const pt = await mapRef.current?.getPointInView?.([coord.longitude, coord.latitude]);
            if (!pt || pt.length < 2) return null;
            return { x: pt[0], y: pt[1] };
          } catch {
            return null;
          }
        },
        fitToCoordinates: () => {
          /* not used on pannable maps */
        },
        animateToRegion: (region: MapRegion) => {
          if (!readyRef.current) return;
          const next = safeMapRegion(region);
          ignoreUntilMsRef.current = Date.now() + 420;
          lastPostedRef.current = { lat: next.latitude, lng: next.longitude };
          const zoom = latitudeDeltaToZoom(next.latitudeDelta ?? 0.01);
          cameraRef.current?.setCamera?.({
            centerCoordinate: [next.longitude, next.latitude],
            zoomLevel: zoom,
            animationDuration: 320,
            animationMode: "flyTo",
          });
        },
      }),
      []
    );

    const rangeCircle =
      circleRadiusMeters && circleRadiusMeters > 0
        ? circlePolygon(originRef.current.longitude, originRef.current.latitude, circleRadiusMeters)
        : null;

    const validSnaps = snapPoints.filter((p) => isValidMapCoordinate(p.latitude, p.longitude));

    if (!Mapbox) {
      return <CustomerMapUnavailable style={style} />;
    }

    return (
      <View style={[styles.fill, style]} collapsable={false}>
        <Mapbox.MapView
          ref={mapRef}
          style={styles.fill}
          styleURL={NATIVE_MAP_STYLE}
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled={false}
          scaleBarEnabled={false}
          scrollEnabled
          zoomEnabled
          pitchEnabled={false}
          rotateEnabled
          surfaceView={false}
          onDidFinishLoadingMap={() => {
            readyRef.current = true;
            lastPostedRef.current = {
              lat: originRef.current.latitude,
              lng: originRef.current.longitude,
            };
            setMapReady(true);
            onMapReady?.();
          }}
          onCameraChanged={(e) => {
            const center = readMapCenter(e);
            if (!center) return;
            postRegion("change", center.lat, center.lng);
          }}
          onMapIdle={(e) => {
            const center = readMapCenter(e);
            if (center) {
              postRegion("complete", center.lat, center.lng);
              return;
            }
            void (async () => {
              try {
                const cam = await mapRef.current?.getCenter?.();
                if (Array.isArray(cam) && cam.length >= 2) {
                  postRegion("complete", Number(cam[1]), Number(cam[0]));
                  return;
                }
              } catch {
                /* ignore */
              }
              const last = lastPostedRef.current;
              if (last) postRegion("complete", last.lat, last.lng);
            })();
          }}
        >
          <Mapbox.Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: [originRef.current.longitude, originRef.current.latitude],
              zoomLevel: originRef.current.zoom,
            }}
            minZoomLevel={8}
            maxZoomLevel={20}
          />
          {rangeCircle ? (
            <Mapbox.ShapeSource id="cx-pin-range" shape={rangeCircle}>
              <Mapbox.FillLayer
                id="cx-pin-range-fill"
                style={{ fillColor: "rgba(59,130,246,0.18)" }}
              />
              <Mapbox.LineLayer
                id="cx-pin-range-line"
                style={{ lineColor: "rgba(59,130,246,0.45)", lineWidth: 1.5 }}
              />
            </Mapbox.ShapeSource>
          ) : null}
          {mapReady
            ? validSnaps.map((p) =>
                renderNativeMarker(
                  Mapbox,
                  `snap-${p.id}`,
                  [p.longitude, p.latitude],
                  { x: 0.5, y: 0.5 },
                  <SnapDot selected={p.selected} onPress={() => onSnapPointPress?.(p.id)} />
                )
              )
            : null}
        </Mapbox.MapView>
      </View>
    );
  }
);

export const MapboxWebPannableMap = forwardRef<CustomerMapRef, Props>(function MapboxWebPannableMap(
  props,
  ref
) {
  const Mapbox = useCustomerNativeMapbox();
  const unavailable = nativeMapUnavailableReason() || !Mapbox;

  if (unavailable) {
    return <MapboxWebPannableMapWebFallback ref={ref} {...props} />;
  }

  return <MapboxWebPannableMapNative ref={ref} {...props} />;
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
