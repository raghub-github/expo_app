/**
 * Floating active-order pill — same chrome as View Cart bar (mint bar + green CTA).
 * Green CTA slideshow: wipe-out then wipe-in between "Track order · Live" and stage ETA.
 * Self-pick-up: green box shows a mini map; tap opens Google Maps route (you → store).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Image as RNImage,
  Animated,
  Easing,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";
import { StoreText } from "@/components/store/StoreText";
import type { ActiveOrder } from "@/store/orderStore";
import {
  getFloatingOrderStatusText,
  getFloatingTrackCtaStageLines,
} from "@/lib/customer-order-status-display";
import { PartnerChatUnreadBadge } from "@/components/orders/PartnerChatUnreadBadge";
import { merchantService } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { resolveDockVehicleImage } from "@/lib/dock-vehicle-image";
import { DiscoveryColors } from "@/features/discovery-home/discoveryTheme";
import { getConfig } from "@/config/env";
import { useLocationStore } from "@/store/locationStore";
import { openGoogleMapsNavigation } from "@/lib/openGoogleMapsNavigation";

const FLOAT_CART_GREEN = "#137243";
const FLOAT_CART_RADIUS = 10;
const FLOAT_BAR_BG = "#E8F5EE";
const FLOAT_BAR_BORDER = "rgba(19, 114, 67, 0.22)";
const DOCK_PILL_MIN_HEIGHT = 60;
/** How long each CTA face stays fully visible. */
const CTA_FACE_HOLD_MS = 12_000;
/** Wipe-out / wipe-in duration (slideshow curtain). */
const CTA_WIPE_MS = 320;
/** Vertical travel for wipe (clipped by overflow). */
const CTA_WIPE_PX = 18;
const MAP_PIN = "#059669";

type FloatingOrderTrackingPillProps = {
  order: ActiveOrder;
  onPress: () => void;
  chatUnreadCount?: number;
  /** Kept for call-site compat; cart-matching UI is always the same height/chrome. */
  emphasis?: "primary" | "secondary";
  /** Discovery food home — charcoal bar, keep the green Track CTA. */
  dark?: boolean;
};

function SelfPickupMapCta({
  storeLat,
  storeLng,
  storeLabel,
  onOpenDirections,
}: {
  storeLat: number | null;
  storeLng: number | null;
  storeLabel: string;
  onOpenDirections: () => void;
}) {
  const staticUri = useMemo(() => {
    const token =
      getConfig().mapboxAccessToken?.trim() ||
      process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ||
      null;
    if (
      !token ||
      storeLat == null ||
      storeLng == null ||
      !Number.isFinite(storeLat) ||
      !Number.isFinite(storeLng)
    ) {
      return null;
    }
    const lon = storeLng.toFixed(5);
    const la = storeLat.toFixed(5);
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+059669(${lon},${la})/${lon},${la},14,0/160x96@2x?access_token=${encodeURIComponent(token)}`;
  }, [storeLat, storeLng]);

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onOpenDirections}
      style={styles.mapCta}
      accessibilityLabel={`Open directions to ${storeLabel}`}
    >
      <View style={styles.mapCtaPreview}>
        {staticUri ? (
          <Image source={{ uri: staticUri }} style={styles.mapCtaImage} contentFit="cover" />
        ) : (
          <View style={styles.mapCtaFallback}>
            <View style={styles.mapRoadH} />
            <View style={styles.mapRoadV} />
          </View>
        )}
        <View style={styles.mapPinOverlay} pointerEvents="none">
          <Ionicons name="location" size={16} color={MAP_PIN} />
        </View>
      </View>
      <View style={styles.mapCtaLabelBar}>
        <StoreText style={styles.mapCtaLabel} bold numberOfLines={1}>
          View Map
        </StoreText>
      </View>
    </TouchableOpacity>
  );
}

export function FloatingOrderTrackingPill({
  order,
  onPress,
  chatUnreadCount = 0,
  dark = false,
}: FloatingOrderTrackingPillProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const storeId = order.storeId?.trim() || null;
  const isVehicleOrder = order.serviceType === "parcel" || order.serviceType === "ride";
  const isSelfPickup = order.isSelfPickup === true && !isVehicleOrder;
  const storeLabel = order.storeName?.trim() || (order.serviceType === "parcel" ? "Courier" : "Your order");
  const statusLine = getFloatingOrderStatusText(order.status, false, order.serviceType);
  const sessionCoords = useLocationStore((s) => s.coords);

  const stageFace = useMemo(
    () =>
      getFloatingTrackCtaStageLines(
        order.status,
        order.etaMinutes > 0 ? order.etaMinutes : null,
        order.serviceType
      ),
    [order.status, order.etaMinutes, order.serviceType]
  );
  const canAlternate = !isSelfPickup && stageFace != null;

  /** false = Track order / Live; true = stage ETA face */
  const [showStageFace, setShowStageFace] = useState(false);
  const wipeY = useRef(new Animated.Value(0)).current;
  const wipeOpacity = useRef(new Animated.Value(1)).current;
  const showStageFaceRef = useRef(false);
  showStageFaceRef.current = showStageFace;

  useEffect(() => {
    if (!canAlternate) {
      setShowStageFace(false);
      wipeY.setValue(0);
      wipeOpacity.setValue(1);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const wipeEase = Easing.out(Easing.cubic);

    const scheduleNext = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        Animated.parallel([
          Animated.timing(wipeY, {
            toValue: -CTA_WIPE_PX,
            duration: CTA_WIPE_MS,
            easing: wipeEase,
            useNativeDriver: true,
          }),
          Animated.timing(wipeOpacity, {
            toValue: 0,
            duration: CTA_WIPE_MS,
            easing: wipeEase,
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (!finished || cancelled) return;
          setShowStageFace(!showStageFaceRef.current);
          wipeY.setValue(CTA_WIPE_PX);
          wipeOpacity.setValue(0);
          Animated.parallel([
            Animated.timing(wipeY, {
              toValue: 0,
              duration: CTA_WIPE_MS,
              easing: wipeEase,
              useNativeDriver: true,
            }),
            Animated.timing(wipeOpacity, {
              toValue: 1,
              duration: CTA_WIPE_MS,
              easing: wipeEase,
              useNativeDriver: true,
            }),
          ]).start(({ finished: inDone }) => {
            if (inDone && !cancelled) scheduleNext();
          });
        });
      }, CTA_FACE_HOLD_MS);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      wipeY.stopAnimation();
      wipeOpacity.stopAnimation();
    };
  }, [canAlternate, wipeY, wipeOpacity, stageFace?.title, stageFace?.subtitle]);

  const vehicleThumb = useMemo(
    () => (isVehicleOrder ? resolveDockVehicleImage(order.vehicleImageKey) : null),
    [isVehicleOrder, order.vehicleImageKey]
  );

  const merchantQuery = useQuery({
    queryKey: ["merchant", storeId],
    queryFn: () => merchantService.getMerchantById(storeId!),
    enabled: !!storeId && !isVehicleOrder,
    staleTime: 2 * 60 * 1000,
  });

  const thumbUri = useMemo(() => {
    if (isVehicleOrder) return null;
    const m = merchantQuery.data;
    if (!m) return null;
    const raw =
      m.displayImage ??
      m.banner_url ??
      (m as { imageUrl?: string | null }).imageUrl ??
      null;
    if (!raw) return null;
    return toAbsoluteImageUrl(raw) ?? raw;
  }, [isVehicleOrder, merchantQuery.data]);

  const storeLat =
    merchantQuery.data?.latitude != null && Number.isFinite(merchantQuery.data.latitude)
      ? Number(merchantQuery.data.latitude)
      : null;
  const storeLng =
    merchantQuery.data?.longitude != null && Number.isFinite(merchantQuery.data.longitude)
      ? Number(merchantQuery.data.longitude)
      : null;

  const openPickupDirections = useCallback(() => {
    if (storeLat == null || storeLng == null) {
      Alert.alert("Directions unavailable", "Restaurant location is not available yet.");
      return;
    }
    const origin =
      sessionCoords?.latitude != null &&
      sessionCoords?.longitude != null &&
      Number.isFinite(sessionCoords.latitude) &&
      Number.isFinite(sessionCoords.longitude)
        ? { lat: sessionCoords.latitude, lng: sessionCoords.longitude }
        : undefined;
    void openGoogleMapsNavigation({
      destination: { lat: storeLat, lng: storeLng },
      origin,
      destinationLabel: storeLabel,
      mode: "directions",
    });
  }, [storeLat, storeLng, sessionCoords, storeLabel]);

  const ctaTitle =
    canAlternate && showStageFace && stageFace ? stageFace.title : "Track order";
  const ctaSub =
    canAlternate && showStageFace && stageFace ? stageFace.subtitle : "Live";
  const a11yLabel =
    stageFace != null
      ? `Track order, ${stageFace.title} ${stageFace.subtitle}`
      : `Track order from ${storeLabel}`;

  return (
    <View style={[styles.shell, dark && styles.shellDark]}>
      <PartnerChatUnreadBadge count={chatUnreadCount} style={styles.floatingUnreadBadge} />
      <Pressable
        style={styles.leftPress}
        onPress={onPress}
        hitSlop={4}
        android_ripple={{ color: "rgba(5, 150, 105, 0.08)" }}
        accessibilityRole="button"
        accessibilityLabel={`Track order from ${storeLabel}`}
      >
        <View style={styles.thumb}>
          {isSelfPickup ? (
            <View style={[styles.thumbPlaceholder, dark && styles.thumbPlaceholderDark]}>
              <Ionicons
                name="footsteps"
                size={20}
                color={dark ? DiscoveryColors.textMuted : FLOAT_CART_GREEN}
              />
            </View>
          ) : vehicleThumb ? (
            <View style={styles.thumbPlaceholder}>
              <RNImage source={vehicleThumb} style={styles.vehicleThumbImg} resizeMode="contain" />
            </View>
          ) : thumbUri && !thumbFailed ? (
            <Image
              source={{ uri: thumbUri }}
              style={styles.thumbImg}
              contentFit="cover"
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <View style={[styles.thumbPlaceholder, dark && styles.thumbPlaceholderDark]}>
              <Ionicons name="bicycle" size={20} color={dark ? DiscoveryColors.textMuted : GatiMitraColors.textSecondary} />
            </View>
          )}
        </View>
        <View style={styles.leftTextCol}>
          <StoreText style={[styles.storeName, dark && styles.storeNameDark]} bold numberOfLines={1}>
            {storeLabel}
          </StoreText>
          <View style={styles.statusRow}>
            <StoreText style={styles.statusText} bold numberOfLines={1}>
              {statusLine}
            </StoreText>
            <Ionicons name="chevron-forward" size={10} color={FLOAT_CART_GREEN} />
          </View>
        </View>
      </Pressable>

      {isSelfPickup ? (
        <SelfPickupMapCta
          storeLat={storeLat}
          storeLng={storeLng}
          storeLabel={storeLabel}
          onOpenDirections={openPickupDirections}
        />
      ) : (
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={onPress}
          style={styles.cta}
          accessibilityLabel={a11yLabel}
        >
          <View style={styles.ctaFill} pointerEvents="none">
            <Animated.View
              style={[
                styles.ctaSlide,
                {
                  opacity: wipeOpacity,
                  transform: [{ translateY: wipeY }],
                },
              ]}
            >
              <StoreText style={styles.ctaTitle} bold numberOfLines={1}>
                {ctaTitle}
              </StoreText>
              <StoreText style={styles.ctaSub} bold numberOfLines={1}>
                {ctaSub}
              </StoreText>
            </Animated.View>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: FLOAT_BAR_BG,
    borderRadius: 16,
    minHeight: DOCK_PILL_MIN_HEIGHT,
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: FLOAT_BAR_BORDER,
    position: "relative",
  },
  shellDark: {
    backgroundColor: DiscoveryColors.card,
    borderColor: DiscoveryColors.border,
  },
  floatingUnreadBadge: {
    position: "absolute",
    top: 4,
    right: 8,
    zIndex: 2,
  },
  leftPress: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    paddingVertical: 2,
    paddingRight: 4,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: GatiMitraColors.mintSoft,
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  vehicleThumbImg: {
    width: 34,
    height: 34,
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraColors.mintSoft,
  },
  thumbPlaceholderDark: {
    backgroundColor: DiscoveryColors.search,
  },
  leftTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  storeName: {
    fontSize: 14,
    fontFamily: StoreFonts.loraBold,
    color: GatiMitraColors.textPrimary,
  },
  storeNameDark: {
    color: DiscoveryColors.text,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    marginTop: 2,
  },
  statusText: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: StoreFonts.loraBold,
    color: FLOAT_CART_GREEN,
  },
  cta: {
    borderRadius: FLOAT_CART_RADIUS,
    overflow: "hidden",
    minWidth: 102,
    maxWidth: 118,
    flexShrink: 0,
  },
  ctaFill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    backgroundColor: FLOAT_CART_GREEN,
    borderRadius: FLOAT_CART_RADIUS,
    overflow: "hidden",
  },
  ctaSlide: {
    alignItems: "center",
    justifyContent: "center",
  },
  ctaTitle: {
    fontSize: 12,
    fontFamily: StoreFonts.loraBold,
    color: "#FFFFFF",
    textAlign: "center",
  },
  ctaSub: {
    fontSize: 10,
    fontFamily: StoreFonts.loraBold,
    color: "rgba(255,255,255,0.95)",
    marginTop: 1,
    textAlign: "center",
  },
  mapCta: {
    width: 72,
    height: 52,
    borderRadius: FLOAT_CART_RADIUS,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(5, 150, 105, 0.45)",
    backgroundColor: "#ECFDF5",
    flexShrink: 0,
  },
  mapCtaPreview: {
    width: "100%",
    height: 34,
    backgroundColor: "#D1FAE5",
    overflow: "hidden",
  },
  mapCtaImage: {
    width: "100%",
    height: "100%",
  },
  mapCtaFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#D1FAE5",
  },
  mapRoadH: {
    position: "absolute",
    left: -2,
    right: -2,
    top: 16,
    height: 3,
    backgroundColor: "#A7F3D0",
    transform: [{ rotate: "-6deg" }],
  },
  mapRoadV: {
    position: "absolute",
    top: -2,
    bottom: -2,
    left: 34,
    width: 3,
    backgroundColor: "#6EE7B7",
    transform: [{ rotate: "10deg" }],
  },
  mapPinOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  mapCtaLabelBar: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAFAFA",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(5, 150, 105, 0.35)",
  },
  mapCtaLabel: {
    fontSize: 9,
    fontFamily: StoreFonts.loraBold,
    color: MAP_PIN,
    letterSpacing: 0.2,
  },
});
