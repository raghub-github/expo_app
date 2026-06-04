/**
 * Rapido-style live tracking after a rider accepts a person-ride order.
 * Map (animated rider → pickup route) + bottom sheet with road ETA, distance, PIN, captain card.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  Share,
  Linking,
  Alert,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { MapboxWebRideTrackingMap } from "@/components/maps/MapboxWebRideTrackingMap";
import type { CustomerMapRef } from "@/lib/customer-map-handle";
import { RideRouteMapPillOverlay } from "@/features/ride/RideRouteMapPillOverlay";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { OrderDetail } from "@/services/order.service";
import type { OrderTrackingResponse } from "@/services/order.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import {
  estimatePickupEtaMinutes,
  formatPickupEtaMinutes,
  formatRouteDistanceMeters,
  formatRiderDistanceToPickup,
  splitPickupOtpDigits,
} from "@/lib/ride-tracking-display";
import { RideTripDetailsSheet } from "@/components/ride/RideTripDetailsSheet";
import { useRiderToPickupLiveRoute } from "@/hooks/useRiderToPickupLiveRoute";
import { bearingDegrees, type MapLatLng } from "@/lib/map-route-utils";
import {
  resolveRidePickupPoint,
  sanitizeRiderPositionForPickup,
} from "@/lib/ride-map-coords";

const ACCENT_BLUE = "#4285F4";
const BANNER_NAVY = "#1B3A6B";
const GREEN = GatiMitraColors.primaryMint;
const { height: SCREEN_H } = Dimensions.get("window");
/** Map ~58% — reference Rapido tracking layout. */
const MAP_HEIGHT_RATIO = 0.58;

type RideAcceptedTrackingScreenProps = {
  order: OrderDetail;
  tracking: OrderTrackingResponse | undefined;
  etaMinutes: number | null;
  onBack: () => void;
  onOpenSupport: () => void;
};

function resolveRideCatalogId(order: OrderDetail): string {
  const raw = order.rideType?.trim().toLowerCase();
  if (raw && ["bike", "bike-lite", "auto", "cab-economy", "cab-premium", "travel"].includes(raw)) {
    return raw;
  }
  return "bike";
}

export function RideAcceptedTrackingScreen({
  order,
  tracking,
  etaMinutes,
  onBack,
  onOpenSupport,
}: RideAcceptedTrackingScreenProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const mapRef = useRef<CustomerMapRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapFrameTick, setMapFrameTick] = useState(0);
  const [tripDetailsVisible, setTripDetailsVisible] = useState(false);
  const lastFitKeyRef = useRef("");

  const pickupPoint = useMemo(() => resolveRidePickupPoint(order), [order]);

  const rawRiderPos = useMemo<MapLatLng | null>(() => {
    if (!tracking?.rider) return null;
    return {
      latitude: tracking.rider.latitude,
      longitude: tracking.rider.longitude,
    };
  }, [tracking?.rider?.latitude, tracking?.rider?.longitude]);

  const riderPos = useMemo(
    () => sanitizeRiderPositionForPickup(rawRiderPos, pickupPoint),
    [rawRiderPos, pickupPoint]
  );

  const rideCatalogId = resolveRideCatalogId(order);
  const { coordinates: routeCoordinates, distanceM, etaMinutes: routeEtaMinutes } =
    useRiderToPickupLiveRoute(riderPos, pickupPoint, rideCatalogId);

  const displayRouteCoordinates = useMemo(() => {
    if (!pickupPoint) return [];
    if (routeCoordinates.length > 1) return routeCoordinates;
    if (riderPos) return [riderPos, pickupPoint];
    return [];
  }, [routeCoordinates, riderPos, pickupPoint]);

  const mapCenter = useMemo(
    () => ({
      latitude: pickupPoint?.latitude ?? 24.88,
      longitude: pickupPoint?.longitude ?? 85.52,
    }),
    [pickupPoint]
  );

  const mapHeight = Math.round(SCREEN_H * MAP_HEIGHT_RATIO);
  const mapFitBottomPad = Math.round(SCREEN_H * 0.34);

  useEffect(() => {
    setMapReady(false);
  }, [order.orderId]);

  useEffect(() => {
    if (pickupPoint) return;
    void queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
  }, [pickupPoint, order.orderId, queryClient]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !pickupPoint) return;
    const fitPoints: MapLatLng[] = [...displayRouteCoordinates];
    if (riderPos) fitPoints.push(riderPos);
    fitPoints.push(pickupPoint);

    if (fitPoints.length === 1) {
      mapRef.current.fitToCoordinates([pickupPoint], {
        edgePadding: { top: 64, right: 40, bottom: mapFitBottomPad, left: 40 },
        maxZoom: 15,
      });
      return;
    }
    if (fitPoints.length < 2) return;

    const fitKey = [
      riderPos?.latitude?.toFixed(4),
      riderPos?.longitude?.toFixed(4),
      displayRouteCoordinates.length,
      displayRouteCoordinates[0]?.latitude?.toFixed(4),
      displayRouteCoordinates[displayRouteCoordinates.length - 1]?.latitude?.toFixed(4),
    ].join("|");

    if (fitKey === lastFitKeyRef.current) return;
    lastFitKeyRef.current = fitKey;

    mapRef.current.fitToCoordinates(fitPoints, {
      edgePadding: { top: 64, right: 40, bottom: mapFitBottomPad, left: 40 },
      animated: true,
    });
  }, [mapReady, displayRouteCoordinates, riderPos, pickupPoint, mapFitBottomPad]);

  const fallbackDistance = pickupPoint
    ? formatRiderDistanceToPickup(
        riderPos?.latitude,
        riderPos?.longitude,
        pickupPoint.latitude,
        pickupPoint.longitude
      )
    : null;
  const distanceLabel =
    formatRouteDistanceMeters(distanceM) ??
    (fallbackDistance ? fallbackDistance.replace(" away", "") : null);

  const pickupEtaMinutes =
    routeEtaMinutes != null && routeEtaMinutes > 0
      ? routeEtaMinutes
      : etaMinutes != null && etaMinutes > 0
        ? etaMinutes
        : pickupPoint
          ? estimatePickupEtaMinutes(
              riderPos?.latitude,
              riderPos?.longitude,
              pickupPoint.latitude,
              pickupPoint.longitude
            )
          : null;

  const riderHeading = useMemo(() => {
    if (tracking?.rider?.headingDegrees != null && Number.isFinite(tracking.rider.headingDegrees)) {
      return tracking.rider.headingDegrees;
    }
    if (riderPos && routeCoordinates.length >= 2) {
      return bearingDegrees(riderPos, routeCoordinates[1]!);
    }
    if (riderPos && pickupPoint) {
      return bearingDegrees(riderPos, pickupPoint);
    }
    return null;
  }, [tracking?.rider?.headingDegrees, riderPos, routeCoordinates, pickupPoint]);

  const captainArrived = !!order.riderReachedPickupAt;
  const bannerText = captainArrived
    ? "Your captain has arrived"
    : "Walk to your pickup-point";

  const pinDigits = splitPickupOtpDigits(order.pickupOtp);
  const riderName = order.rider?.name?.trim() || "Captain";
  const riderFirstName = riderName.split(" ")[0]?.toUpperCase() ?? riderName.toUpperCase();
  const photoUri = toAbsoluteImageUrl(order.rider?.photoUrl);
  const vehicleReg = order.rider?.vehicleRegistration?.trim().toUpperCase();
  const vehicleModel = order.rider?.vehicleModel?.trim().toUpperCase();
  const riderRating = order.rider?.rating;
  const pickupAddress = order.merchantAddress?.trim() || "Pickup location";

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `I'm riding with GatiMitra. Order ${order.formattedOrderId ?? order.orderId}. Pickup OTP: ${order.pickupOtp ?? "—"}.`,
      });
    } catch {
      /* user dismissed */
    }
  }, [order]);

  const normalizeRiderPhone = useCallback(() => {
    const phone = order.rider?.phone?.replace(/\D/g, "");
    if (!phone) return null;
    return phone.length === 10 ? `+91${phone}` : phone.startsWith("+") ? phone : `+${phone}`;
  }, [order.rider?.phone]);

  const handleMessageRider = useCallback(() => {
    const normalized = normalizeRiderPhone();
    if (!normalized) {
      Alert.alert("Unavailable", "Captain contact is not available right now.");
      return;
    }
    Linking.openURL(`sms:${normalized}`).catch(() => {
      Alert.alert("Could not open messages", "Please try again.");
    });
  }, [normalizeRiderPhone]);

  const handleCallRider = useCallback(() => {
    const normalized = normalizeRiderPhone();
    if (!normalized) {
      Alert.alert("Unavailable", "Captain phone number is not available right now.");
      return;
    }
    Linking.openURL(`tel:${normalized}`).catch(() => {
      Alert.alert("Could not open dialer", "Please try again.");
    });
  }, [normalizeRiderPhone]);

  if (!pickupPoint) {
    return (
      <View style={[styles.screen, styles.mapLoading]}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.loadingMapText}>Loading pickup location…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={[styles.mapSection, { height: mapHeight }]}>
        {mapReady ? (
          <MapboxWebRideTrackingMap
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            center={mapCenter}
            routeCoordinates={displayRouteCoordinates}
            riderPosition={riderPos}
            riderHeading={riderHeading}
            onMapReady={() => setMapReady(true)}
            onRegionChangeComplete={() => setMapFrameTick((t) => t + 1)}
          />
        ) : (
          <View style={styles.mapLoading}>
            <ActivityIndicator size="small" color={GREEN} />
          </View>
        )}

        <RideRouteMapPillOverlay
          mapRef={mapRef}
          pickupPoint={pickupPoint}
          dropPoint={null}
          pickupLabel="Pickup"
          dropLabel=""
          pickupBias="left"
          dropBias="right"
          syncToken={order.orderId.length + mapFrameTick}
          mapFrameTick={mapFrameTick}
          onEditPickup={() => {}}
          onEditDrop={() => {}}
        />

        <TouchableOpacity
          style={[styles.backBtn, { top: insets.top + 8 }]}
          onPress={onBack}
          hitSlop={12}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>

        <View style={[styles.mapFabCol, { bottom: 20 }]}>
          <TouchableOpacity style={styles.mapFab} onPress={handleShare} activeOpacity={0.85}>
            <Ionicons name="share-social-outline" size={20} color={ACCENT_BLUE} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.safetyFab} onPress={onOpenSupport} activeOpacity={0.85}>
            <Ionicons name="shield-checkmark" size={18} color={ACCENT_BLUE} />
            <Text style={styles.safetyFabText}>Safety</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.sheetHandleWrap}>
          <View style={styles.sheetHandle} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{bannerText}</Text>
        </View>

        <View style={styles.etaBlock}>
          <Text style={styles.etaTitle}>
            Pickup in{" "}
            <Text style={styles.etaHighlight}>{formatPickupEtaMinutes(pickupEtaMinutes)}</Text>
          </Text>
          {distanceLabel ? (
            <Text style={styles.etaSub}>
              Captain <Text style={styles.etaSubBold}>{distanceLabel}</Text> away
            </Text>
          ) : (
            <Text style={styles.etaSub}>
              {riderPos ? "Captain is on the way" : "Waiting for captain location…"}
            </Text>
          )}
        </View>

        {pinDigits.length > 0 ? (
          <View style={styles.pinRow}>
            <Text style={styles.pinLabel}>Start your order with PIN</Text>
            <View style={styles.pinBoxes}>
              {pinDigits.map((digit, index) => (
                <View key={`pin-${index}`} style={styles.pinBox}>
                  <Text style={styles.pinDigit}>{digit}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.captainCard}>
          <View style={styles.captainTopRow}>
            <View style={styles.captainInfo}>
              {vehicleReg ? (
                <Text style={styles.vehicleReg} numberOfLines={1}>
                  {vehicleReg}
                </Text>
              ) : null}
              {vehicleModel ? (
                <Text style={styles.vehicleModel} numberOfLines={1}>
                  {vehicleModel}
                </Text>
              ) : null}
              <Text style={styles.captainName} numberOfLines={1}>
                {riderName.toUpperCase()}
              </Text>
            </View>
            <View style={styles.avatarWrap}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>{riderName.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              {riderRating != null && Number.isFinite(riderRating) ? (
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingText}>{riderRating.toFixed(1)}</Text>
                  <Text style={styles.ratingStar}>★</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.contactRow}>
            <TouchableOpacity
              style={styles.messageBtn}
              onPress={handleMessageRider}
              activeOpacity={0.85}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={17} color="#374151" />
              <Text style={styles.messageBtnText} numberOfLines={1}>
                Message {riderFirstName}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.callBtn}
              onPress={handleCallRider}
              activeOpacity={0.85}
              accessibilityLabel="Call captain"
            >
              <Ionicons name="call" size={20} color="#374151" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 14, 24) }]}>
          <View style={styles.footerLeft}>
            <Text style={styles.footerLabel}>Pickup From</Text>
            <Text style={styles.footerAddress} numberOfLines={2}>
              {pickupAddress}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.tripDetailsBtn}
            onPress={() => setTripDetailsVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.tripDetailsText}>Trip Details</Text>
          </TouchableOpacity>
        </View>
      </View>

      <RideTripDetailsSheet
        visible={tripDetailsVisible}
        order={order}
        onClose={() => setTripDetailsVisible(false)}
      />
    </View>
  );
}

const fabShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  android: { elevation: 4 },
  default: {},
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  mapSection: {
    width: "100%",
    backgroundColor: "#E8EDF2",
  },
  mapLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingMapText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  backBtn: {
    position: "absolute",
    left: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...fabShadow,
  },
  mapFabCol: {
    position: "absolute",
    right: 14,
    alignItems: "flex-end",
    gap: 10,
  },
  mapFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...fabShadow,
  },
  safetyFab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    ...fabShadow,
  },
  safetyFabText: {
    fontSize: 14,
    fontWeight: "700",
    color: ACCENT_BLUE,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    overflow: "hidden",
    flexShrink: 0,
  },
  sheetHandleWrap: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 0,
    backgroundColor: "#FFFFFF",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },
  banner: {
    backgroundColor: BANNER_NAVY,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  bannerText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  etaBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  etaTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    letterSpacing: -0.2,
  },
  etaHighlight: {
    color: GREEN,
    fontWeight: "800",
  },
  etaSub: {
    marginTop: 4,
    fontSize: 13,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  etaSubBold: {
    fontWeight: "800",
    color: "#374151",
  },
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    gap: 10,
  },
  pinLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    lineHeight: 16,
  },
  pinBoxes: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  pinBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  pinDigit: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  captainCard: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
  },
  captainTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  captainInfo: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  vehicleReg: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.6,
  },
  vehicleModel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    letterSpacing: 0.2,
  },
  captainName: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: 0.3,
  },
  contactRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  messageBtn: {
    flex: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    minHeight: 42,
  },
  messageBtnText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  callBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    minHeight: 42,
  },
  avatarWrap: {
    width: 62,
    alignItems: "center",
    position: "relative",
    paddingBottom: 6,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E5E7EB",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: "700",
    color: "#6B7280",
  },
  ratingBadge: {
    position: "absolute",
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#111827",
  },
  ratingStar: {
    fontSize: 10,
    fontWeight: "700",
    color: "#F59E0B",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  footerLeft: {
    flex: 1,
    minWidth: 0,
  },
  footerLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    textTransform: "none",
  },
  footerAddress: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
    lineHeight: 17,
  },
  tripDetailsBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  tripDetailsText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
});
