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
import { MAPBIKE_IMAGE } from "@/lib/customer-map-assets";
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
  onMapReady?: () => void;
  onRegionChangeComplete?: () => void;
  style?: object;
};

export const MapboxWebRideTrackingMap = forwardRef<CustomerMapRef, Props>(
  function MapboxWebRideTrackingMap(
    {
      center,
      routeCoordinates,
      riderPosition,
      riderHeading,
      onMapReady,
      onRegionChangeComplete,
      style,
    },
    ref
  ) {
    const webRef = useRef<WebView>(null);
    const readyRef = useRef(false);
    const pendingFitRef = useRef<{
      coords: LatLng[];
      options: { edgePadding: MapEdgePadding; maxZoom?: number };
    } | null>(null);
    const pointWaiters = useRef(
      new Map<number, (value: { x: number; y: number } | null) => void>()
    );
    const pointSeq = useRef(0);

    const token = getConfig().mapboxAccessToken?.trim() ?? "";
    const [bikeDataUri, setBikeDataUri] = useState<string | null>(null);

    useEffect(() => {
      let cancelled = false;
      void resolveMapImageDataUri(MAPBIKE_IMAGE).then((uri) => {
        if (!cancelled) setBikeDataUri(uri);
      });
      return () => {
        cancelled = true;
      };
    }, []);

    const html = useMemo(() => {
      if (!token || !bikeDataUri) return "";
      return buildRideTrackingMapHtml(token, center, bikeDataUri);
    }, [token, center.latitude, center.longitude, bikeDataUri]);

    const applyFit = useCallback((coords: LatLng[], options: { edgePadding: MapEdgePadding; maxZoom?: number }) => {
      const json = JSON.stringify(coords);
      const pad = JSON.stringify(options.edgePadding);
      const maxZoom = options.maxZoom ?? 15;
      webRef.current?.injectJavaScript(
        `window.fitToCoordinates && window.fitToCoordinates(${json}, ${pad}, ${maxZoom}); true;`
      );
    }, []);

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
          applyFit(coords, options);
        },
      }),
      [applyFit]
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
            injectRoute();
            injectRider();
            if (pendingFitRef.current) {
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
      [applyFit, injectRoute, injectRider, onMapReady, onRegionChangeComplete]
    );

    useEffect(() => {
      injectRoute();
      injectRider();
    }, [injectRoute, injectRider]);

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
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
