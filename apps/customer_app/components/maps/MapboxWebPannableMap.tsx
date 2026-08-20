import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { getConfig } from "@/config/env";
import { buildPannableMapHtml } from "@/components/maps/mapbox-web-pannable-html";
import { latitudeDeltaToZoom } from "@/components/maps/mapbox-web-shared";
import { CustomerMapUnavailable } from "@/components/maps/CustomerMapUnavailable";
import type { CustomerMapRef } from "@/lib/customer-map-handle";
import { isValidMapCoordinate } from "@/lib/map-coordinates";

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

export const MapboxWebPannableMap = forwardRef<CustomerMapRef, Props>(function MapboxWebPannableMap(
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

  const token = getConfig().mapboxAccessToken?.trim() ?? "";

  const originRef = useRef({
    latitude: initialRegion.latitude,
    longitude: initialRegion.longitude,
    latitudeDelta: initialRegion.latitudeDelta ?? 0.01,
  });

  const html = useMemo(() => {
    if (!token) return "";
    const origin = originRef.current;
    return buildPannableMapHtml(
      token,
      { latitude: origin.latitude, longitude: origin.longitude },
      {
        latitudeDelta: origin.latitudeDelta,
        circleRadiusMeters,
      }
    );
    // Keep the first camera; later moves use animateToRegion so panning does not reload the WebView.
  }, [token, circleRadiusMeters]);

  const injectSnapPoints = useCallback(() => {
    if (!readyRef.current) return;
    const json = JSON.stringify(snapPoints);
    webRef.current?.injectJavaScript(`window.updateSnapPoints && window.updateSnapPoints(${json}); true;`);
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
        const zoom = latitudeDeltaToZoom(region.latitudeDelta ?? 0.01);
        webRef.current?.injectJavaScript(
          `window.flyToCenter && window.flyToCenter(${region.latitude}, ${region.longitude}, ${zoom}); true;`
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
      />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
