import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { getConfig } from "@/config/env";
import {
  buildMerchantTrackingMapHtml,
  type MerchantTrackingMapPayload,
} from "@/lib/merchant-rider-tracking-html";

type Props = {
  center: { latitude: number; longitude: number };
  payload: MerchantTrackingMapPayload;
  style?: object;
};

/**
 * WebView (mapbox-gl) live rider map for the merchant. The HTML is built ONCE from the
 * initial center; every payload change is pushed into the running page via
 * `window.mtUpdate(...)` (injectJavaScript) so the map never reloads — only a GeoJSON
 * source + one eased marker move. Same tech + smoothness as the customer app.
 */
export function MerchantRiderTrackingMap({ center, payload, style }: Props) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const token = (getConfig().mapboxPublicToken ?? "").trim();

  // Freeze the initial center so the HTML memo never rebuilds (which would reload the map).
  const initialCenterRef = useRef(center);
  const html = useMemo(() => {
    if (!token) return "";
    return buildMerchantTrackingMapHtml(token, initialCenterRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const pushUpdate = React.useCallback(() => {
    if (!readyRef.current || !webRef.current) return;
    const json = JSON.stringify(payload);
    webRef.current.injectJavaScript(
      `window.mtUpdate && window.mtUpdate(${JSON.stringify(json)}); true;`
    );
  }, [payload]);

  useEffect(() => {
    pushUpdate();
  }, [pushUpdate]);

  if (!token) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>Map unavailable — Mapbox token not configured.</Text>
      </View>
    );
  }
  if (failed) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>Live map couldn&apos;t load. Check your connection.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        // WebView can't reach the RN network stack; the map loads mapbox-gl from CDN.
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as { type?: string };
            if (msg.type === "ready") {
              readyRef.current = true;
              pushUpdate();
            }
          } catch {
            /* ignore */
          }
        }}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        // Perf: keep the page alive across order-screen re-renders; no repaint churn.
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden", borderRadius: 12, minHeight: 220 },
  web: { flex: 1, backgroundColor: "#eef2f5" },
  fallback: {
    flex: 1,
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 16,
  },
  fallbackText: { color: "#475569", fontSize: 13, textAlign: "center" },
});
