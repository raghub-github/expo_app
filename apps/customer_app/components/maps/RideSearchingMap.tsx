import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { getConfig } from "@/config/env";
import { buildRideSearchingMapHtml } from "@/components/maps/mapbox-web-ride-searching-html";
import { CustomerMapUnavailable } from "@/components/maps/CustomerMapUnavailable";
import { useMapMarkerDataUri } from "@/hooks/useMapMarkerDataUri";
import type { NearbySupplyRider } from "@/services/rideAvailability.service";

type Props = {
  center: { latitude: number; longitude: number };
  nearbyRiders?: NearbySupplyRider[];
  /** Catalog image_key for nearby rider markers (bike, auto, cab, cab_premium). */
  riderMarkerImageKey?: string;
  /** Keeps pickup radar above the bottom sheet (px). */
  bottomMapPadding?: number;
  style?: object;
};

function escJsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Searching-for-rider map — Mapbox only. */
export function RideSearchingMap({
  center,
  nearbyRiders = [],
  riderMarkerImageKey = "bike",
  bottomMapPadding = 360,
  style,
}: Props) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const initialCenterRef = useRef(center);
  const token = getConfig().mapboxAccessToken?.trim() ?? "";
  const markerDataUri = useMapMarkerDataUri(riderMarkerImageKey);

  const html = useMemo(() => {
    if (!token || !markerDataUri) return "";
    return buildRideSearchingMapHtml(
      token,
      initialCenterRef.current,
      markerDataUri,
      undefined,
      bottomMapPadding
    );
  }, [token, markerDataUri, bottomMapPadding]);

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

  const injectMarkerIcon = useCallback(() => {
    if (!readyRef.current || !markerDataUri) return;
    const uri = escJsString(markerDataUri);
    webRef.current?.injectJavaScript(
      `window.setRiderMarkerIcon && window.setRiderMarkerIcon('${uri}'); true;`
    );
  }, [markerDataUri]);

  const injectRiders = useCallback(() => {
    if (!readyRef.current) return;
    const json = JSON.stringify(ridersPayload);
    webRef.current?.injectJavaScript(
      `window.updateNearbyRiders && window.updateNearbyRiders(${json}); true;`
    );
  }, [ridersPayload]);

  const syncLayers = useCallback(() => {
    injectMarkerIcon();
    injectRiders();
  }, [injectMarkerIcon, injectRiders]);

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
        mixedContentMode="always"
        allowFileAccess
        allowUniversalAccessFromFileURLs
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data) as { type?: string };
            if (msg.type === "ready") {
              readyRef.current = true;
              syncLayers();
            }
          } catch {
            /* ignore */
          }
        }}
        onLoadEnd={() => {
          if (readyRef.current) syncLayers();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
