import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { getConfig } from "@/config/env";
import {
  buildDeliveryTrackingMapHtml,
  type DeliveryMapPayload,
} from "@/components/maps/mapbox-web-delivery-html";
import { CustomerMapUnavailable } from "@/components/maps/CustomerMapUnavailable";

type Props = {
  center: { latitude: number; longitude: number };
  payload: DeliveryMapPayload;
  fitCoords?: { latitude: number; longitude: number }[];
  onReady?: () => void;
  style?: object;
};

export function MapboxWebDeliveryMap({ center, payload, fitCoords, onReady, style }: Props) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const token = getConfig().mapboxAccessToken?.trim() ?? "";

  const html = useMemo(() => {
    if (!token) return "";
    return buildDeliveryTrackingMapHtml(token, center);
  }, [token, center.latitude, center.longitude]);

  const sync = useCallback(() => {
    if (!readyRef.current) return;
    const json = JSON.stringify(payload);
    webRef.current?.injectJavaScript(`window.updateDeliveryMap && window.updateDeliveryMap(${json}); true;`);
    if (fitCoords && fitCoords.length >= 1) {
      const fitJson = JSON.stringify(fitCoords);
      webRef.current?.injectJavaScript(
        `window.fitToCoordinates && window.fitToCoordinates(${fitJson}, { top: 36, bottom: 36, left: 36, right: 36 }, 15); true;`
      );
    }
  }, [payload, fitCoords]);

  useEffect(() => {
    sync();
  }, [sync]);

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
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data) as { type?: string };
            if (msg.type === "ready") {
              readyRef.current = true;
              sync();
              onReady?.();
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
