import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { getConfig } from "@/config/env";
import { buildRideSearchingMapHtml } from "@/components/maps/mapbox-web-ride-searching-html";
import { CustomerMapUnavailable } from "@/components/maps/CustomerMapUnavailable";
import { MAPBIKE_IMAGE } from "@/lib/customer-map-assets";
import { resolveMapImageDataUri } from "@/lib/map-webview-image-uri";
import { resolveRiderVehicleMarkerImage } from "@/features/ride/rideOptionAssets";
import type { NearbySupplyRider } from "@/services/rideAvailability.service";

type Props = {
  center: { latitude: number; longitude: number };
  nearbyRiders?: NearbySupplyRider[];
  /** Keeps pickup radar above the bottom sheet (px). */
  bottomMapPadding?: number;
  style?: object;
};

/** Searching-for-rider map — Mapbox only. */
export function RideSearchingMap({
  center,
  nearbyRiders = [],
  bottomMapPadding = 360,
  style,
}: Props) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const token = getConfig().mapboxAccessToken?.trim() ?? "";
  const [bikeDataUri, setBikeDataUri] = useState<string | null>(null);
  const [ridersPayload, setRidersPayload] = useState<
    Array<{
      riderId: number;
      lat: number;
      lng: number;
      heading: number | null;
      markerUri: string;
    }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    void resolveMapImageDataUri(MAPBIKE_IMAGE).then((uri) => {
      if (!cancelled) setBikeDataUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await Promise.all(
        nearbyRiders.map(async (r) => {
          const vehicleType = r.vehicleTypes?.find(Boolean) ?? r.vehicleType ?? "bike";
          const markerUri = await resolveMapImageDataUri(
            resolveRiderVehicleMarkerImage(vehicleType)
          );
          return {
            riderId: r.riderId,
            lat: r.lat,
            lng: r.lng,
            heading: r.heading,
            markerUri,
          };
        })
      );
      if (!cancelled) setRidersPayload(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [nearbyRiders, bikeDataUri]);

  const html = useMemo(() => {
    if (!token || !bikeDataUri) return "";
    return buildRideSearchingMapHtml(token, center, bikeDataUri, undefined, bottomMapPadding);
  }, [token, center.latitude, center.longitude, bikeDataUri, bottomMapPadding]);

  const syncRiders = useCallback(() => {
    if (!readyRef.current) return;
    const json = JSON.stringify(ridersPayload);
    webRef.current?.injectJavaScript(
      `window.updateNearbyRiders && window.updateNearbyRiders(${json}); true;`
    );
  }, [ridersPayload, nearbyRiders.length]);

  useEffect(() => {
    syncRiders();
  }, [syncRiders]);

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
        mixedContentMode="always"
        allowFileAccess
        allowUniversalAccessFromFileURLs
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data) as { type?: string };
            if (msg.type === "ready") {
              readyRef.current = true;
              syncRiders();
            }
          } catch {
            /* ignore */
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
