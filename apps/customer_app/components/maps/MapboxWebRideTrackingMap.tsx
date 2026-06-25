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
import { buildRideTrackingMapHtml } from "@/components/maps/mapbox-web-ride-tracking-html";
import { CustomerMapUnavailable } from "@/components/maps/CustomerMapUnavailable";
import type { LatLng } from "@/services/directions.service";

type Props = {
  center: LatLng;
  routeCoordinates: LatLng[];
  riderPosition: LatLng | null;
  riderHeading?: number | null;
  pickupPosition?: LatLng | null;
  dropPosition?: LatLng | null;
  /** Catalog image_key for captain marker (bike, auto, cab, cab_premium). */
  riderMarkerImageKey?: string;
  /** Google Maps–style blue nav route + tilted follow camera (drop leg). */
  navigationMode?: boolean;
  highlightPickupZone?: boolean;
  highlightDropZone?: boolean;
  geofenceRadiusM?: number;
  onMapReady?: () => void;
  onRegionChangeComplete?: () => void;
  style?: object;
};

function escJsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export const MapboxWebRideTrackingMap = forwardRef<CustomerMapRef, Props>(
  function MapboxWebRideTrackingMap(
    {
      center,
      routeCoordinates,
      riderPosition,
      riderHeading,
      pickupPosition,
      dropPosition = null,
      riderMarkerImageKey = "bike",
      navigationMode = false,
      highlightPickupZone = false,
      highlightDropZone = false,
      geofenceRadiusM = 200,
      onMapReady,
      onRegionChangeComplete,
      style,
    },
    ref
  ) {
    const webRef = useRef<WebView>(null);
    const readyRef = useRef(false);
    const initialCenterRef = useRef(center);
    const pendingFitRef = useRef<{
      coords: LatLng[];
      options: { edgePadding: MapEdgePadding; maxZoom?: number };
    } | null>(null);
    const pointWaiters = useRef(
      new Map<number, (value: { x: number; y: number } | null) => void>()
    );
    const pointSeq = useRef(0);

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
      return buildRideTrackingMapHtml(token, initialCenterRef.current, markerDataUri, {
        navigationStyle: navigationMode,
      });
    }, [token, markerDataUri, navigationMode]);

    useEffect(() => {
      readyRef.current = false;
    }, [html]);

    const applyFit = useCallback((coords: LatLng[], options: { edgePadding: MapEdgePadding; maxZoom?: number }) => {
      const json = JSON.stringify(coords);
      const pad = JSON.stringify(options.edgePadding);
      const maxZoom = options.maxZoom ?? 15;
      webRef.current?.injectJavaScript(
        `window.fitToCoordinates && window.fitToCoordinates(${json}, ${pad}, ${maxZoom}); true;`
      );
    }, []);

    const injectMarkerIcon = useCallback(() => {
      if (!readyRef.current || !markerDataUri) return;
      const uri = escJsString(markerDataUri);
      webRef.current?.injectJavaScript(
        `window.setRiderMarkerIcon && window.setRiderMarkerIcon('${uri}'); true;`
      );
    }, [markerDataUri]);

    const injectRoute = useCallback(() => {
      if (!readyRef.current) return;
      const json = JSON.stringify(routeCoordinates.length >= 2 ? routeCoordinates : []);
      webRef.current?.injectJavaScript(`window.updateRoute && window.updateRoute(${json}); true;`);
    }, [routeCoordinates]);

    const injectRider = useCallback(() => {
      if (!readyRef.current) return;
      const lat = riderPosition?.latitude ?? null;
      const lng = riderPosition?.longitude ?? null;
      const heading = riderHeading ?? null;
      webRef.current?.injectJavaScript(
        `window.updateRider && window.updateRider(${lat}, ${lng}, ${heading}); true;`
      );
    }, [riderPosition, riderHeading]);

    const injectNavigationMode = useCallback(() => {
      if (!readyRef.current) return;
      const enabled = navigationMode ? "true" : "false";
      const dLat = dropPosition?.latitude ?? null;
      const dLng = dropPosition?.longitude ?? null;
      webRef.current?.injectJavaScript(
        `window.setNavigationMode && window.setNavigationMode(${enabled}, ${dLat}, ${dLng}); true;`
      );
    }, [navigationMode, dropPosition?.latitude, dropPosition?.longitude]);

    const injectPickupZone = useCallback(() => {
      if (!readyRef.current) return;
      const lat = pickupPosition?.latitude ?? null;
      const lng = pickupPosition?.longitude ?? null;
      webRef.current?.injectJavaScript(
        `window.updatePickupZoneHighlight && window.updatePickupZoneHighlight(${lat}, ${lng}, ${highlightPickupZone ? "true" : "false"}, ${geofenceRadiusM}); true;`
      );
    }, [pickupPosition, highlightPickupZone, geofenceRadiusM]);

    const injectDropZone = useCallback(() => {
      if (!readyRef.current) return;
      const lat = dropPosition?.latitude ?? null;
      const lng = dropPosition?.longitude ?? null;
      webRef.current?.injectJavaScript(
        `window.updateDropZoneHighlight && window.updateDropZoneHighlight(${lat}, ${lng}, ${highlightDropZone ? "true" : "false"}, ${geofenceRadiusM}); true;`
      );
    }, [dropPosition, highlightDropZone, geofenceRadiusM]);

    const syncLayers = useCallback(() => {
      injectMarkerIcon();
      injectRoute();
      injectRider();
      injectNavigationMode();
      injectPickupZone();
      injectDropZone();
    }, [
      injectMarkerIcon,
      injectRoute,
      injectRider,
      injectNavigationMode,
      injectPickupZone,
      injectDropZone,
    ]);

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
          if (navigationMode) return;
          applyFit(coords, options);
        },
      }),
      [applyFit, navigationMode]
    );

    const onMessage = useCallback(
      (event: WebViewMessageEvent) => {
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
          if (msg.type === "ready") {
            readyRef.current = true;
            syncLayers();
            if (pendingFitRef.current && !navigationMode) {
              applyFit(pendingFitRef.current.coords, pendingFitRef.current.options);
              pendingFitRef.current = null;
            }
            onMapReady?.();
            return;
          }
          if (msg.type === "moveend") onRegionChangeComplete?.();
        } catch {
          /* ignore */
        }
      },
      [applyFit, syncLayers, navigationMode, onMapReady, onRegionChangeComplete]
    );

    useEffect(() => {
      if (!readyRef.current) return;
      syncLayers();
    }, [syncLayers]);

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
  }
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
