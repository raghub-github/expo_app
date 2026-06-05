import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, forwardRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { resolveMapboxPublicToken } from "@/src/lib/mapbox-env";
import { MAPBIKE_IMAGE, MAPBOX_HOME_STYLE, HOME_MAP_ZOOM } from "@/src/lib/map-assets";
import { resolveMapImageDataUri } from "@/src/lib/map-webview-image-uri";
import { isOrderPinAwayFromRider } from "@/src/lib/geo-distance";
import { buildRiderHomeMapHtml } from "@/src/components/maps/mapbox-web-html";

type OrderPin = {
  id: string;
  pickupLat: number;
  pickupLng: number;
  estimatedEarning: number;
};

type Props = {
  lat: number;
  lng: number;
  orders: OrderPin[];
  showRadar?: boolean;
  style?: object;
};

export type MapboxWebRiderMapHandle = {
  recenter: () => void;
};

export const MapboxWebRiderMap = forwardRef<MapboxWebRiderMapHandle, Props>(function MapboxWebRiderMap(
  { lat, lng, orders, showRadar = false, style },
  ref
) {
  const webRef = useRef<WebView>(null);
  const token = resolveMapboxPublicToken();
  const [bikeDataUri, setBikeDataUri] = useState<string | null>(null);

  const visibleOrders = useMemo(
    () =>
      orders.filter((o) =>
        isOrderPinAwayFromRider(lat, lng, o.pickupLat, o.pickupLng)
      ),
    [orders, lat, lng]
  );

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
    return buildRiderHomeMapHtml(
      token,
      lat,
      lng,
      visibleOrders.map((o) => ({
        id: o.id,
        lat: o.pickupLat,
        lng: o.pickupLng,
        earning: o.estimatedEarning,
      })),
      bikeDataUri,
      MAPBOX_HOME_STYLE,
      HOME_MAP_ZOOM,
      showRadar
    );
  }, [token, lat, lng, visibleOrders, bikeDataUri, showRadar]);

  const syncRadar = useCallback(() => {
    webRef.current?.injectJavaScript(
      `window.setShowRadar && window.setShowRadar(${showRadar ? "true" : "false"}); true;`
    );
  }, [showRadar]);

  const injectRiderUpdate = useCallback(
    (animate = true) => {
      webRef.current?.injectJavaScript(
        `window.updateRider && window.updateRider(${lng}, ${lat}, ${animate ? "true" : "false"}); true;`
      );
    },
    [lat, lng]
  );

  const recenter = useCallback(() => {
    webRef.current?.injectJavaScript(
      `window.recenterMap && window.recenterMap(${lng}, ${lat}); true;`
    );
  }, [lat, lng]);

  useImperativeHandle(ref, () => ({ recenter }), [recenter]);

  useEffect(() => {
    injectRiderUpdate(true);
  }, [lat, lng, injectRiderUpdate]);

  useEffect(() => {
    syncRadar();
  }, [syncRadar]);

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
        mixedContentMode="always"
        allowFileAccess
        allowUniversalAccessFromFileURLs
        onLoadEnd={() => {
          injectRiderUpdate(false);
          syncRadar();
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
