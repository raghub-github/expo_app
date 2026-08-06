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
    p.showPickupMarker === false ? "0" : "1",
    p.showDropMarker === false ? "0" : "1",
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

    // The web side only reads `fullRoute` as a fallback for when `remainingRoute`
    // is too short to draw (see mapbox-food-delivery-script.ts — both the bounds
    // pass and the line builder prefer `remainingRoute` and fall back). Once the
    // remaining polyline is usable, shipping the full one too doubles the size of
    // a JSON string that crosses the WebView bridge on every rider position, up
    // to 1 Hz, for the whole delivery.
    if (mapPayload.remainingRoute && mapPayload.remainingRoute.length >= 2) {
      delete (mapPayload as { fullRoute?: unknown }).fullRoute;
      delete (mapPayload as { route?: unknown }).route;
    }

    const json = JSON.stringify(mapPayload);
    const recenterJs = forceRefit ? "if (window.recenterOnRider) { window.recenterOnRider(); }" : "";
    webRef.current?.injectJavaScript(
      `(function(){ try { ${recenterJs} if (window.updateDeliveryMap) { window.updateDeliveryMap(${json}); } } catch(e) {} })(); true;`
    );
  }, [payload, refitNonce]);

  // `sync` closes over `payload`, which is a fresh object on most renders, so
  // `syncAll` changed identity constantly. Anything depending on it re-ran every
  // render — including the settle timeout below, which meant a `setTimeout` was
  // created and cleared on each render while rider positions streamed in at up
  // to 1 Hz. Holding it in a ref keeps the callbacks callable without making
  // them dependencies.
  const syncAllRef = useRef<() => void>(() => {});
  syncAllRef.current = () => {
    injectMarkerIcon();
    sync();
  };
  const syncAll = useCallback(() => syncAllRef.current(), []);

  // Payload-driven sync. `sync` itself is a no-op when the derived syncKey is
  // unchanged, so this stays cheap even when `payload` churns.
  useEffect(() => {
    syncAll();
  }, [payload, refitNonce, markerDataUri, syncAll]);

  // Route arrays land a beat after the rider position they belong to; this
  // re-syncs once they do. Keyed on the lengths only — not on `syncAll` — so it
  // no longer re-arms on every unrelated render.
  useEffect(() => {
    if (!readyRef.current) return;
    const t = setTimeout(() => syncAllRef.current(), 80);
    return () => clearTimeout(t);
  }, [
    payload.remainingRoute.length,
    payload.connectorRoute?.length,
    payload.preRiderArcRoute?.length,
  ]);

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
