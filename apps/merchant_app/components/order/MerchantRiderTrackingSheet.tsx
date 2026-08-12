import { useEffect, useMemo, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ActivityIndicator, Pressable, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import type { OrderRecord } from "@/hooks/useOrders";
import type { MerchantRiderLiveEnrichment } from "@/hooks/useMerchantRiderLiveEnrichment";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { getConfig, resolveUrlForDevice } from "@/config/env";
import type { MerchantRiderTrackingPayload } from "@/services/riderTrackingApi";
import {
  buildMapUpdateScript,
  buildMerchantRiderTrackingMapHtml,
} from "@/lib/merchantRiderTrackingMapHtml";
import {
  resolveRiderCardVariant,
  riderStatusHeadline,
  riderStatusSubline,
  type RiderCardVariant,
} from "@/lib/riderMerchantArrivalDisplay";
import { callRider } from "@/lib/orderCardActions";
import { mapbikeMarkerUri } from "@/lib/merchant-map-assets";
import { MX } from "@/lib/appAssetKeys";
import { useAppAssetUrl } from "@/store/appAssetsStore";
import { resolveImageUrl } from "@/services/outletApi";
import { RiderSelfieAvatar } from "@/components/order/RiderSelfieAvatar";
import { RiderSelfieViewerModal } from "@/components/order/RiderSelfieViewerModal";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  order: OrderRecord;
  storeId: number;
  token: string;
  enrichment: MerchantRiderLiveEnrichment;
};

function trackingCoordsChanged(
  prev: MerchantRiderTrackingPayload | null,
  next: MerchantRiderTrackingPayload | null
): boolean {
  if (!next) return false;
  if (!prev?.location && next.location) return true;
  if (!prev?.location || !next.location) return prev !== next;
  const dLat = Math.abs(prev.location.latitude - next.location.latitude);
  const dLng = Math.abs(prev.location.longitude - next.location.longitude);
  const headingA = prev.location.heading_degrees ?? 0;
  const headingB = next.location.heading_degrees ?? 0;
  return dLat > 0.00005 || dLng > 0.00005 || Math.abs(headingA - headingB) > 8;
}

function parseOrdersFoodId(orderId: string): number | null {
  const n = parseInt(orderId, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function MerchantRiderTrackingSheet({
  visible,
  onClose,
  order,
  storeId,
  token,
  enrichment,
}: Props) {
  const webRef = useRef<WebView>(null);
  const lastMapInjectRef = useRef<MerchantRiderTrackingPayload | null>(null);
  const [selfieModalOpen, setSelfieModalOpen] = useState(false);
  const ordersFoodId = parseOrdersFoodId(order.id);
  const mapboxToken = getConfig().mapboxPublicToken;

  const data = enrichment.trackingData;
  const loading = enrichment.loading;
  const error = enrichment.trackingError;

  const riderName =
    enrichment.riderName ??
    data?.rider.name?.trim() ??
    order.riderName?.trim() ??
    "Delivery partner";
  const riderMobile = enrichment.riderMobile ?? data?.rider.mobile ?? order.riderMobile ?? null;
  const riderSelfie = enrichment.riderSelfieUrl ?? data?.rider.selfie_url ?? order.riderSelfieUrl;

  const variant: RiderCardVariant =
    data?.rider_display_variant ?? resolveRiderCardVariant(order);
  const arrivalSubtitle =
    enrichment.arrivalSubtitle ??
    (data?.approach?.remaining_distance_m != null
      ? (() => {
          const m = data.approach!.remaining_distance_m;
          const eta = data.approach!.eta_minutes;
          const km = m / 1000;
          const distLabel =
            km < 1
              ? `${Math.max(50, Math.round(m))} m away`
              : `${(Math.round(km * 10) / 10).toFixed(km % 1 === 0 ? 0 : 1)} km away`;
          const mins =
            eta != null && eta > 0 ? Math.max(1, Math.round(eta)) : Math.max(1, Math.round(km / 0.35));
          return `Arriving in ${mins} min · ${distLabel}`;
        })()
      : null);

  const headline = useMemo(
    () => riderStatusHeadline(variant, riderName),
    [variant, riderName]
  );
  const subline = useMemo(
    () => riderStatusSubline(variant, riderName, arrivalSubtitle),
    [variant, riderName, arrivalSubtitle]
  );

  const mapbikeFromStore = useAppAssetUrl(MX.map.bike);
  const mapbikeUri = useMemo(() => {
    if (mapbikeFromStore?.trim()) {
      return resolveImageUrl(mapbikeFromStore) ?? resolveUrlForDevice(mapbikeFromStore.trim());
    }
    return mapbikeMarkerUri();
  }, [mapbikeFromStore]);

  const injectMapResize = () => {
    webRef.current?.injectJavaScript(
      `(function(){try{if(window.resizeRiderTrackingMap){window.resizeRiderTrackingMap();}else if(window.map&&window.map.resize){window.map.resize();}}catch(e){} true;})();`
    );
  };

  const injectBikeIcon = (uri: string) => {
    if (!uri.trim()) return;
    webRef.current?.injectJavaScript(
      `(function(){try{if(window.setRiderBikeIcon){window.setRiderBikeIcon(${JSON.stringify(uri)});} }catch(e){} true;})();`
    );
  };

  // Build HTML once tracking data arrives; inject Super Admin bike when URL resolves.
  const [mapHtml, setMapHtml] = useState<string | null>(null);
  const builtWithBikeRef = useRef("");
  useEffect(() => {
    if (!visible) {
      setMapHtml(null);
      builtWithBikeRef.current = "";
      return;
    }
    if (!mapboxToken || !data) return;

    const bikeReady = mapbikeUri.trim();

    if (!mapHtml) {
      // Wait briefly for merchant.map.bike (map.bike) so the marker uses Super Admin asset.
      if (!bikeReady) {
        const t = setTimeout(() => {
          const lateBike = mapbikeMarkerUri();
          setMapHtml(buildMerchantRiderTrackingMapHtml(mapboxToken, data, lateBike));
          builtWithBikeRef.current = lateBike;
        }, 500);
        return () => clearTimeout(t);
      }
      setMapHtml(buildMerchantRiderTrackingMapHtml(mapboxToken, data, bikeReady));
      builtWithBikeRef.current = bikeReady;
      return;
    }

    if (bikeReady && bikeReady !== builtWithBikeRef.current) {
      builtWithBikeRef.current = bikeReady;
      injectBikeIcon(bikeReady);
    }
  }, [visible, mapboxToken, data, mapHtml, mapbikeUri]);

  useEffect(() => {
    if (!data || !mapHtml) return;
    if (!trackingCoordsChanged(lastMapInjectRef.current, data)) return;
    lastMapInjectRef.current = data;
    webRef.current?.injectJavaScript(buildMapUpdateScript(data));
  }, [data, mapHtml]);

  // Sheet animation / Android layout often leaves Mapbox at 0×0; re-fit after open.
  useEffect(() => {
    if (!visible || !mapHtml) return;
    const t1 = setTimeout(injectMapResize, 100);
    const t2 = setTimeout(injectMapResize, 400);
    const t3 = setTimeout(injectMapResize, 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [visible, mapHtml]);

  const mapHint =
    !data?.location && data?.store
      ? "Store is on the map. Rider GPS will appear when they start navigation."
      : !data?.store && !data?.location
        ? "Set store coordinates in store settings to see the map."
        : null;

  return (
    <MerchantBottomSheetShell visible={visible} onClose={onClose} maxHeightPercent="92%">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Live rider tracking</Text>
        <Text style={styles.headerSub} numberOfLines={1}>
          {order.formattedOrderId
            ? `#${order.formattedOrderId.replace(/^#/, "")}`
            : "Order ID unavailable"}
        </Text>
      </View>

      <View
        style={styles.mapWrap}
        collapsable={false}
        onLayout={() => {
          if (mapHtml) injectMapResize();
        }}
      >
        {loading && !data ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
          </View>
        ) : error && !data ? (
          <View style={styles.loader}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : mapHtml ? (
          <WebView
            ref={webRef}
            // No baseUrl — matches customer tracking maps; api.mapbox.com baseUrl can block style tiles.
            source={{ html: mapHtml }}
            style={styles.map}
            scrollEnabled={false}
            nestedScrollEnabled={Platform.OS === "android"}
            overScrollMode="never"
            androidLayerType="hardware"
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            allowFileAccess
            allowUniversalAccessFromFileURLs
            mixedContentMode="always"
            setSupportMultipleWindows={false}
            onLoadEnd={() => {
              injectMapResize();
              if (data) {
                webRef.current?.injectJavaScript(buildMapUpdateScript(data));
              }
            }}
            onMessage={() => {
              injectMapResize();
            }}
          />
        ) : (
          <View style={styles.loader}>
            <Text style={styles.errorText}>
              {mapboxToken
                ? "Waiting for rider GPS…"
                : "Add EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to show the map."}
            </Text>
          </View>
        )}
      </View>

      {mapHint ? (
        <Text style={styles.mapHint} numberOfLines={2}>
          {mapHint}
        </Text>
      ) : null}

      <View style={styles.footerCard}>
        <RiderSelfieAvatar
          selfieUrl={riderSelfie}
          riderName={riderName}
          size={48}
          onPress={() => setSelfieModalOpen(true)}
        />
        <View style={styles.footerBody}>
          <Text style={styles.footerName} numberOfLines={1}>
            {riderName}
          </Text>
          <Text style={styles.footerHeadline} numberOfLines={2}>
            {headline}
          </Text>
          {subline ? (
            <Text style={styles.footerSubline} numberOfLines={2}>
              {subline}
            </Text>
          ) : null}
          {riderMobile ? (
            <Text style={styles.footerPhone} numberOfLines={1}>
              {riderMobile}
            </Text>
          ) : null}
        </View>
        {riderMobile ? (
          <Pressable
            onPress={() => void callRider(riderMobile)}
            style={({ pressed }) => [styles.footerCallBtn, pressed && styles.pressed]}
            accessibilityLabel={`Call ${riderName}`}
          >
            <Ionicons name="call" size={18} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>

      <RiderSelfieViewerModal
        visible={selfieModalOpen}
        imageUrl={riderSelfie ?? null}
        riderName={riderName}
        onClose={() => setSelfieModalOpen(false)}
      />
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
  headerSub: {
    marginTop: 4,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  mapWrap: {
    height: 360,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  map: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  errorText: {
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    fontSize: 14,
  },
  mapHint: {
    marginHorizontal: 16,
    marginTop: 8,
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    textAlign: "center",
  },
  footerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
    ...GatiMitraMerchant.shadowSm,
  },
  footerBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  footerName: {
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  footerHeadline: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
  footerSubline: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.primaryDark,
    lineHeight: 17,
  },
  footerPhone: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textTertiary,
  },
  footerCallBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.88 },
});
