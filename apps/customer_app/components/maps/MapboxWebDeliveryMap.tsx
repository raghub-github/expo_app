import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { getConfig } from "@/config/env";
import {
  buildDeliveryTrackingMapHtml,
  type DeliveryMapPayload,
} from "@/components/maps/mapbox-web-delivery-html";
import { useMapMarkerDataUri } from "@/hooks/useMapMarkerDataUri";
import { CustomerMapUnavailable } from "@/components/maps/CustomerMapUnavailable";

type Props = {
  center: { latitude: number; longitude: number };
  payload: DeliveryMapPayload;
  refitNonce?: number;
  onReady?: () => void;
  style?: object;
};

function escJsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function payloadSyncKey(p: DeliveryMapPayload): string {
  const remaining = p.remainingRoute.length >= 2 ? p.remainingRoute : p.fullRoute ?? p.route ?? [];
  const routeKey =
    remaining.length >= 2
      ? `${remaining[0]!.latitude.toFixed(4)},${remaining[remaining.length - 1]!.latitude.toFixed(4)},${remaining.length}`
      : "0";
  const connectorKey =
    p.connectorRoute && p.connectorRoute.length >= 2
      ? `${p.connectorRoute.length}:${p.connectorRoute[0]!.latitude.toFixed(4)}`
      : "0";
  const preRiderKey =
    p.preRiderArcRoute && p.preRiderArcRoute.length >= 2
      ? `${p.preRiderArcRoute.length}:${p.preRiderArcRoute[0]!.latitude.toFixed(4)}`
      : "0";
  return [
    routeKey,
    connectorKey,
    preRiderKey,
    p.hideRouteLine ? "1" : "0",
    p.pickupLat?.toFixed(5) ?? "",
    p.pickupLng?.toFixed(5) ?? "",
    p.dropLat?.toFixed(5) ?? "",
    p.dropLng?.toFixed(5) ?? "",
    p.riderLat?.toFixed(5) ?? "",
    p.riderLng?.toFixed(5) ?? "",
    p.riderHeading?.toFixed(0) ?? "",
    p.routeJoinLat?.toFixed(5) ?? "",
    p.routeJoinLng?.toFixed(5) ?? "",
    p.highlightPickupZone ? "1" : "0",
    p.highlightDropZone ? "1" : "0",
    p.riderArrived ? "1" : "0",
    p.refitCamera ? "1" : "0",
    p.mapPhase ?? "",
  ].join("|");
}

export function MapboxWebDeliveryMap({
  center,
  payload,
  refitNonce = 0,
  onReady,
  style,
}: Props) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const lastSyncKeyRef = useRef("");
  const lastRefitNonceRef = useRef(0);
  const token = getConfig().mapboxAccessToken?.trim() ?? "";
  const markerDataUri = useMapMarkerDataUri("bike");
  // Captured once (first non-null value) for the initial HTML build only — must NOT
  // be a dependency of the `html` memo below, or the WebView would reload every time
  // the icon resolves. injectMarkerIcon() (below) upgrades it in place instead.
  const initialMarkerUriRef = useRef(markerDataUri);
  if (initialMarkerUriRef.current == null && markerDataUri != null) {
    initialMarkerUriRef.current = markerDataUri;
  }

  // Render as soon as the token is known — never block the whole map on the rider
  // marker icon, which resolves asynchronously (see useMapMarkerDataUri) and can be
  // slow on a cold cache. injectMarkerIcon() below upgrades the icon in place once
  // markerDataUri resolves, no reload needed.
  const html = useMemo(() => {
    if (!token) return "";
    return buildDeliveryTrackingMapHtml(token, center, initialMarkerUriRef.current ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, center.latitude, center.longitude]);

  useEffect(() => {
    readyRef.current = false;
  }, [html]);

  const markReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    lastSyncKeyRef.current = "";
    onReady?.();
  }, [onReady]);

  const injectMarkerIcon = useCallback(() => {
    if (!readyRef.current || !markerDataUri) return;
    const uri = escJsString(markerDataUri);
    webRef.current?.injectJavaScript(
      `window.setRiderMarkerIcon && window.setRiderMarkerIcon('${uri}'); true;`
    );
  }, [markerDataUri]);

  const sync = useCallback(() => {
    if (!readyRef.current) return;
    const syncKey = payloadSyncKey(payload);
    const forceRefit = refitNonce !== lastRefitNonceRef.current;
    if (syncKey === lastSyncKeyRef.current && !forceRefit) return;
    lastSyncKeyRef.current = syncKey;
    lastRefitNonceRef.current = refitNonce;

    const mapPayload: DeliveryMapPayload = {
      ...payload,
      refitCamera: forceRefit || payload.refitCamera === true,
    };
    const json = JSON.stringify(mapPayload);
    webRef.current?.injectJavaScript(
      `(function(){ try { if (window.updateDeliveryMap) { window.updateDeliveryMap(${json}); } } catch(e) {} })(); true;`
    );
  }, [payload, refitNonce]);

  const syncAll = useCallback(() => {
    injectMarkerIcon();
    sync();
  }, [injectMarkerIcon, sync]);

  useEffect(() => {
    syncAll();
  }, [syncAll, refitNonce]);

  useEffect(() => {
    if (!readyRef.current) return;
    const t = setTimeout(() => syncAll(), 80);
    return () => clearTimeout(t);
  }, [payload.remainingRoute.length, payload.connectorRoute?.length, payload.preRiderArcRoute?.length, syncAll]);

  if (!token || !html) {
    // html is only ever empty when token is — see the memo above.
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
        onLoadEnd={() => {
          markReady();
          setTimeout(() => syncAll(), 120);
        }}
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data) as { type?: string };
            if (msg.type === "ready") {
              markReady();
              lastSyncKeyRef.current = "";
              syncAll();
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
