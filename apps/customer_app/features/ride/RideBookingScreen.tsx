/**
 * GatiMitra Ride Booking – reference home layout.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocationStore } from "@/store/locationStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";
import { AllServicesGrid, type ServiceId } from "./AllServicesGrid";
import { IntercityServicesList } from "./IntercityServicesList";
import { RideServiceBottomNav, type RideServiceTab, getRideServiceBottomNavHeight } from "./RideServiceBottomNav";
import { ActiveRideBottomSheet } from "@/components/ride/ActiveRideBottomSheet";
import type { OrderSummary } from "@/services/order.service";
import { useActivePersonRideOrders } from "@/hooks/useActivePersonRideOrders";
import { RIDE_DUE_FARE_NOTICE } from "@/lib/ride-fare-gate";
import { resolvePersonRideTrackingNavigation } from "@/lib/person-ride-orders";
import { tripKmFromCoords } from "@/lib/intercity-rides";
import { RideHomePromoBanner, RideSafetyBanner } from "./RideHomeSections";
import { useFeaturedOffersRide } from "@/hooks/useFeaturedOffersRide";
import { filterRideBookFeaturedOffers, filterRideOffersForCompletedRides, completedPersonRideCountHint } from "@/lib/ride-offers";
import { GatiCashHeaderPill } from "@/components/home/GatiCashHeaderPill";
import { prefetchCriticalRideAssetImagesSync } from "@/lib/rideCriticalAssets";
import { useAppAssetsStore } from "@/store/appAssetsStore";

const PAD = 18;
const TRACKING_PILL_H = 56;
const TRACKING_PILL_MULTI_HINT_H = 22;
/** Clear breathing room above tab bar — keep small so it doesn’t look like a blank white row. */
const TRACKING_FLOAT_GAP = 8;

type RideRouteParams = {
  tab?: string;
  pickup?: string;
  drop?: string;
  pickupLabel?: string;
  dropLabel?: string;
  pickupLat?: string;
  pickupLng?: string;
  dropLat?: string;
  dropLng?: string;
  stops?: string;
  bookedForSelf?: string;
  passengerName?: string;
  passengerPhone?: string;
};

export function RideBookingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const routeParams = useLocalSearchParams<RideRouteParams>();
  const { address, coords, locationHydrated } = useLocationStore();
  const appAssets = useAppAssetsStore((s) => s.assets);

  useLayoutEffect(() => {
    prefetchCriticalRideAssetImagesSync(appAssets);
  }, [appAssets]);

  const offerLocationParams = useMemo(() => {
    const pincode = address?.pincode?.trim() || undefined;
    const state = address?.state?.trim() || undefined;
    const city = address?.city?.trim() || undefined;
    return {
      pincode,
      state,
      city,
      lat: coords?.latitude,
      lng: coords?.longitude,
    };
  }, [address?.pincode, address?.state, address?.city, coords?.latitude, coords?.longitude]);

  const { data: rideOffersData } = useFeaturedOffersRide(offerLocationParams, locationHydrated);
  const { activeRides, dueFareRide, hasDueFare, orders: myOrders } = useActivePersonRideOrders(true);
  const completedRideCount = completedPersonRideCountHint(myOrders);
  const rideFeaturedOffers = useMemo(
    () =>
      filterRideOffersForCompletedRides(
        filterRideBookFeaturedOffers(rideOffersData?.offers ?? []),
        completedRideCount
      ),
    [rideOffersData?.offers, completedRideCount]
  );

  useFocusEffect(
    useCallback(() => {
      if (!locationHydrated) return;
      void queryClient.invalidateQueries({ queryKey: ["featured-offers-ride"] });
    }, [locationHydrated, queryClient])
  );

  const initialTab: RideServiceTab =
    routeParams.tab === "intercity" ? "intercity" : "all";
  const [activeTab, setActiveTab] = useState<RideServiceTab>(initialTab);
  const [measuredNavH, setMeasuredNavH] = useState(0);

  useEffect(() => {
    if (routeParams.tab === "intercity") setActiveTab("intercity");
  }, [routeParams.tab]);

  const locationDisplay = address?.fullAddress ?? address?.primary ?? "Select location";
  const trackingRides = useMemo(() => {
    const byId = new Map<string, OrderSummary>();
    for (const ride of activeRides) {
      byId.set(ride.orderId, ride);
    }
    if (dueFareRide && !byId.has(dueFareRide.orderId)) {
      byId.set(dueFareRide.orderId, dueFareRide);
    }
    return [...byId.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [activeRides, dueFareRide]);

  const trackingRide = trackingRides[0] ?? null;
  const showTrackingPill = trackingRides.length > 0;

  const intercityTripKm = tripKmFromCoords(
    routeParams.pickupLat,
    routeParams.pickupLng,
    routeParams.dropLat,
    routeParams.dropLng
  );
  const hasIntercityRoute =
    Boolean(routeParams.pickup?.trim()) &&
    Boolean(routeParams.drop?.trim()) &&
    intercityTripKm != null;

  const estimatedNavH = getRideServiceBottomNavHeight(insets.bottom);
  // Prefer measured height so the pill gap isn’t inflated by estimate mismatch (white “duplicate row”).
  const rideNavH = measuredNavH > 0 ? measuredNavH : estimatedNavH;
  const trackingPillStackH = showTrackingPill
    ? TRACKING_PILL_H +
      (trackingRides.length > 1 ? TRACKING_PILL_MULTI_HINT_H : 0) +
      TRACKING_FLOAT_GAP
    : 0;

  const bottomStackH = rideNavH + trackingPillStackH;

  const onBottomNavHeight = useCallback((height: number) => {
    setMeasuredNavH((prev) => (prev === height ? prev : height));
  }, []);

  const openIntercityPickup = useCallback(() => {
    if (hasDueFare && trackingRide) {
      const target = resolvePersonRideTrackingNavigation(trackingRide);
      router.push({ pathname: target.pathname, params: target.params });
      return;
    }
    router.push({
      pathname: "/home/service/ride-pickup",
      params: { bookingMode: "intercity", returnTo: "ride" },
    });
  }, [hasDueFare, trackingRide, router]);

  const handleTabChange = useCallback(
    (tab: RideServiceTab) => {
      setActiveTab(tab);
      if (tab === "intercity" && !hasIntercityRoute) {
        openIntercityPickup();
      }
    },
    [hasIntercityRoute, openIntercityPickup]
  );

  const goToRideBook = useCallback(
    (serviceId: ServiceId) => {
      if (hasDueFare && trackingRide) {
        const target = resolvePersonRideTrackingNavigation(trackingRide);
        router.push({ pathname: target.pathname, params: target.params });
        return;
      }

      if (activeTab === "intercity" && hasIntercityRoute) {
        router.push({
          pathname: "/home/service/ride-book",
          params: {
            pickup: routeParams.pickup ?? "",
            drop: routeParams.drop ?? "",
            pickupLabel: routeParams.pickupLabel ?? "",
            dropLabel: routeParams.dropLabel ?? "",
            pickupLat: routeParams.pickupLat ?? "",
            pickupLng: routeParams.pickupLng ?? "",
            dropLat: routeParams.dropLat ?? "",
            dropLng: routeParams.dropLng ?? "",
            stops: routeParams.stops ?? "",
            bookedForSelf: routeParams.bookedForSelf ?? "true",
            passengerName: routeParams.passengerName ?? "",
            passengerPhone: routeParams.passengerPhone ?? "",
            bookingMode: "intercity",
            selectedRideId: serviceId,
          },
        });
        return;
      }

      router.push({
        pathname: "/home/service/ride-pickup",
        params: { preselectService: serviceId },
      });
    },
    [activeTab, hasDueFare, hasIntercityRoute, trackingRide, router, routeParams]
  );

  const goToLocation = () => router.push("/location");
  const openDefaultRide = () => goToRideBook("bike");

  const trackingBottom = rideNavH + TRACKING_FLOAT_GAP;
  // Root layout already reserves the status-bar strip — only add a small gap below it.
  const headerTopPad = STATUS_BAR_TO_HEADER_GAP;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <LinearGradient
        colors={["#FFFFFF", "#F4FBF6", "#FFFFFF"]}
        locations={[0, 0.5, 1]}
        style={[styles.headerBlock, { paddingTop: headerTopPad }]}
      >
        <View style={styles.titleBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={20} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerMain}>
            <TouchableOpacity style={styles.titleRow} activeOpacity={0.85} onPress={goToLocation}>
              <AppText style={styles.headerTitle} numberOfLines={1}>
                Book a Ride
              </AppText>
              <Ionicons name="chevron-down" size={14} color={GatiMitraColors.deepMintStart} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.locationRow} onPress={goToLocation} activeOpacity={0.85}>
              <View style={styles.locationPin}>
                <Ionicons name="location" size={12} color={GatiMitraColors.deepMintStart} />
              </View>
              <AppText style={styles.locationText} numberOfLines={1} ellipsizeMode="tail">
                {locationDisplay}
              </AppText>
            </TouchableOpacity>
          </View>

          <View style={styles.headerActions}>
            <GatiCashHeaderPill />
            <TouchableOpacity
              style={styles.bellBtn}
              onPress={() => router.push("/notifications")}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications-outline" size={20} color={GatiMitraColors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {hasDueFare ? (
          <TouchableOpacity
            style={styles.dueFareRibbon}
            activeOpacity={0.9}
            onPress={() => {
              if (!trackingRide) return;
              const target = resolvePersonRideTrackingNavigation(trackingRide);
              router.push({ pathname: target.pathname, params: target.params });
            }}
          >
            <View style={styles.dueFareRibbonInner}>
              <Ionicons name="alert-circle" size={16} color="#B45309" />
              <AppText style={styles.dueFareRibbonText} numberOfLines={2}>
                {RIDE_DUE_FARE_NOTICE}
              </AppText>
              <Ionicons name="chevron-forward" size={16} color="#B45309" />
            </View>
          </TouchableOpacity>
        ) : null}
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomStackH + 8, flexGrow: 1 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "all" ? (
          <>
            <RideHomePromoBanner offers={rideFeaturedOffers} onBookNow={openDefaultRide} />
            <AllServicesGrid onSelectService={goToRideBook} servicesDisabled={hasDueFare} />
            <View style={styles.safetySpacer} />
            <RideSafetyBanner />
          </>
        ) : (
          <IntercityServicesList
            tripKm={intercityTripKm}
            servicesDisabled={hasDueFare}
            onSelectService={goToRideBook}
            onChangeRoute={openIntercityPickup}
          />
        )}
      </ScrollView>

      {showTrackingPill ? (
        <ActiveRideBottomSheet rides={trackingRides} bottomInset={trackingBottom} />
      ) : null}

      <RideServiceBottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onHeightChange={onBottomNavHeight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraColors.softBackground,
  },
  headerBlock: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.03)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.015,
    shadowRadius: 1,
    elevation: 0,
  },
  titleBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: PAD,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    borderWidth: 1,
    borderColor: "rgba(187, 247, 208, 0.55)",
  },
  headerMain: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    letterSpacing: -0.3,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
    paddingRight: 8,
  },
  locationPin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    flexShrink: 0,
    marginTop: 1,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    borderWidth: 1,
    borderColor: "rgba(187, 247, 208, 0.55)",
  },
  locationText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
    lineHeight: 16,
  },
  safetySpacer: {
    minHeight: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingTop: 14,
  },
  dueFareRibbon: {
    marginHorizontal: PAD,
    marginBottom: 10,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  dueFareRibbonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dueFareRibbonText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#9A3412",
    lineHeight: 16,
  },
});
