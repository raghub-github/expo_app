import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View, Platform } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { getConfig } from "@/config/env";
import { resolveNearbyRiderMarkerImage } from "@/features/ride/rideOptionAssets";
import { resolveMapImageDataUri } from "@/lib/map-webview-image-uri";
import type { CustomerMapRef, MapEdgePadding } from "@/lib/customer-map-handle";
import { buildRideBookMapHtml } from "@/components/maps/mapbox-web-ride-book-html";
import type { LatLng } from "@/services/directions.service";
import type { NearbySupplyRider } from "@/services/rideAvailability.service";

type FitOptions = {
  edgePadding: MapEdgePadding;
  animated?: boolean;
  maxZoom?: number;
};

type Props = {
  center: LatLng;
  routeCoordinates: LatLng[];
  showRoadPolyline: boolean;
  stopCoords: LatLng[];
  nearbyRiders: NearbySupplyRider[];
  riderMarkerImageKey?: string;
  onMapReady?: () => void;
  onRegionChange?: () => void;
  onRegionChangeComplete?: () => void;
  onUserMapGesture?: () => void;
  style?: object;
};

function escJsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export const MapboxWebRideBookMap = forwardRef<CustomerMapRef, Props>(function MapboxWebRideBookMap(
  {
    center,
    routeCoordinates,
    showRoadPolyline,
    stopCoords,
    nearbyRiders,
    riderMarkerImageKey = "bike",
    onMapReady,
    onRegionChange,
    onRegionChangeComplete,
    onUserMapGesture,
    style,
  },
  ref
) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const pendingFitRef = useRef<{ coords: LatLng[]; options: FitOptions } | null>(null);
  const pointWaiters = useRef(
    new Map<number, (value: { x: number; y: number } | null) => void>()
  );
  const pointSeq = useRef(0);
  const initialCenterRef = useRef(center);

  const token = getConfig().mapboxAccessToken?.trim() ?? "";
  const [markerDataUri, setMarkerDataUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const source = resolveNearbyRiderMarkerImage(riderMarkerImageKey);
    void resolveMapImageDataUri(source).then((uri) => {
      if (!cancelled) setMarkerDataUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [riderMarkerImageKey]);

  const html = useMemo(() => {
    if (!token || !markerDataUri) return "";
    return buildRideBookMapHtml(token, initialCenterRef.current, markerDataUri);
  }, [token, markerDataUri]);

  useEffect(() => {
    readyRef.current = false;
  }, [html]);

  const ridersPayload = useMemo(
    () =>
      nearbyRiders.map((r) => ({
        riderId: r.riderId,
        lat: r.lat,
        lng: r.lng,
        heading: r.heading,
      })),
    [nearbyRiders]
  );

  const injectRoute = useCallback(() => {
    if (!readyRef.current || !showRoadPolyline || routeCoordinates.length < 2) {
      webRef.current?.injectJavaScript(
        `window.updateRoute && window.updateRoute([]); true;`
      );
      return;
    }
    const json = JSON.stringify(routeCoordinates);
    webRef.current?.injectJavaScript(`window.updateRoute && window.updateRoute(${json}); true;`);
  }, [routeCoordinates, showRoadPolyline]);

  const injectRiders = useCallback(() => {
    if (!readyRef.current) return;
    const json = JSON.stringify(ridersPayload);
    webRef.current?.injectJavaScript(`window.updateRiders && window.updateRiders(${json}); true;`);
  }, [ridersPayload]);

  const injectStops = useCallback(() => {
    if (!readyRef.current) return;
    const json = JSON.stringify(stopCoords);
    webRef.current?.injectJavaScript(`window.updateStops && window.updateStops(${json}); true;`);
  }, [stopCoords]);

  const injectMarkerIcon = useCallback(() => {
    if (!readyRef.current || !markerDataUri) return;
    const uri = escJsString(markerDataUri);
    webRef.current?.injectJavaScript(
      `window.setRiderMarkerIcon && window.setRiderMarkerIcon('${uri}'); true;`
    );
  }, [markerDataUri]);

  const syncLayers = useCallback(() => {
    injectMarkerIcon();
    injectRoute();
    injectRiders();
    injectStops();
  }, [injectMarkerIcon, injectRoute, injectRiders, injectStops]);

  const applyFitToCoordinates = useCallback((coords: LatLng[], options: FitOptions) => {
    if (coords.length < 1) return;
    const json = JSON.stringify(coords);
    const pad = JSON.stringify(options.edgePadding);
    const maxZoom = options.maxZoom ?? 15;
    webRef.current?.injectJavaScript(
      `window.fitToCoordinates && window.fitToCoordinates(${json}, ${pad}, ${maxZoom}); true;`
    );
  }, []);

  const flushPendingFit = useCallback(() => {
    const pending = pendingFitRef.current;
    if (!pending || !readyRef.current) return;
    pendingFitRef.current = null;
    applyFitToCoordinates(pending.coords, pending.options);
  }, [applyFitToCoordinates]);

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
      fitToCoordinates: (coords, options) => {
        if (!readyRef.current) {
          pendingFitRef.current = { coords, options };
          return;
        }
        applyFitToCoordinates(coords, options);
      },
    }),
    [applyFitToCoordinates]
  );

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type?: string;
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
      if (msg.type === "usergesture") {
        onUserMapGesture?.();
        return;
      }
      if (msg.type === "ready") {
        readyRef.current = true;
        syncLayers();
        flushPendingFit();
        onMapReady?.();
        return;
      }
      if (msg.type === "move") {
        onRegionChange?.();
        return;
      }
      if (msg.type === "moveend") {
        onRegionChangeComplete?.();
      }
    } catch {
      // ignore malformed messages
    }
  }, [onMapReady, onRegionChange, onRegionChangeComplete, onUserMapGesture, syncLayers, flushPendingFit]);

  useEffect(() => {
    if (!readyRef.current) return;
    syncLayers();
  }, [syncLayers]);

  if (!token || !html) {
    return <View style={[styles.fill, style]} />;
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
        nestedScrollEnabled={Platform.OS === "android"}
        overScrollMode="never"
        androidLayerType="hardware"
        allowFileAccess
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        onMessage={onMessage}
        onLoadEnd={() => {
          if (readyRef.current) syncLayers();
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
