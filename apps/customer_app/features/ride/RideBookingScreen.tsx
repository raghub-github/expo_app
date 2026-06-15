/**
 * GatiMitra Ride Booking – reference home layout.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocationStore } from "@/store/locationStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HEADER_PADDING_TOP } from "@/constants/layout";
import { AllServicesGrid, type ServiceId } from "./AllServicesGrid";
import { IntercityServicesList } from "./IntercityServicesList";
import { RideServiceBottomNav, type RideServiceTab } from "./RideServiceBottomNav";
import { ActiveRideBottomSheet } from "@/components/ride/ActiveRideBottomSheet";
import { useActivePersonRideOrders } from "@/hooks/useActivePersonRideOrders";
import { RIDE_DUE_FARE_NOTICE } from "@/lib/ride-fare-gate";
import { resolvePersonRideTrackingNavigation } from "@/lib/person-ride-orders";
import { tripKmFromCoords } from "@/lib/intercity-rides";
import { RideHomePromoBanner, RideSafetyBanner } from "./RideHomeSections";
import { useFeaturedOffersRide } from "@/hooks/useFeaturedOffersRide";
import { filterRideBookFeaturedOffers } from "@/lib/ride-offers";

const PAD = 18;
const BOTTOM_NAV_H = 72;
const DUE_BANNER_H = 64;
const TRACKING_PILL_H = 76;

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
  const rideFeaturedOffers = useMemo(
    () => filterRideBookFeaturedOffers(rideOffersData?.offers ?? []),
    [rideOffersData?.offers]
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

  useEffect(() => {
    if (routeParams.tab === "intercity") setActiveTab("intercity");
  }, [routeParams.tab]);

  const locationDisplay = address?.fullAddress ?? address?.primary ?? "Select location";
  const { trackingRide, hasDueFare } = useActivePersonRideOrders(true);
  const showTrackingPill = trackingRide != null;

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

  const bottomStackH =
    BOTTOM_NAV_H +
    (showTrackingPill ? TRACKING_PILL_H : 0) +
    (hasDueFare ? DUE_BANNER_H : 0);

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

  const trackingBottom = insets.bottom + BOTTOM_NAV_H + 12;
  const bannerBottom = trackingBottom + (showTrackingPill ? TRACKING_PILL_H + 8 : 0);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <LinearGradient
        colors={["#FFFFFF", "#F4FBF6", "#FFFFFF"]}
        locations={[0, 0.5, 1]}
        style={[styles.headerBlock, { paddingTop: HEADER_PADDING_TOP }]}
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
              <Text style={styles.headerTitle} numberOfLines={1}>
                Book a Ride
              </Text>
              <Ionicons name="chevron-down" size={14} color={GatiMitraColors.deepMintStart} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.locationRow} onPress={goToLocation} activeOpacity={0.85}>
              <View style={styles.locationPin}>
                <Ionicons name="location" size={12} color={GatiMitraColors.deepMintStart} />
              </View>
              <Text style={styles.locationText} numberOfLines={1} ellipsizeMode="tail">
                {locationDisplay}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => router.push("/notifications")}
            activeOpacity={0.8}
          >
            <Ionicons name="notifications-outline" size={20} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + bottomStackH + 8, flexGrow: 1 },
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

      {hasDueFare ? (
        <View style={[styles.dueFareFloating, { bottom: bannerBottom }]}>
          <Ionicons name="alert-circle-outline" size={20} color="#B45309" />
          <Text style={styles.dueFareText}>{RIDE_DUE_FARE_NOTICE}</Text>
        </View>
      ) : null}

      {showTrackingPill ? (
        <ActiveRideBottomSheet rides={[trackingRide]} bottomInset={trackingBottom} />
      ) : null}

      <RideServiceBottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        bottomInset={insets.bottom}
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
    borderBottomColor: "rgba(187, 247, 208, 0.45)",
    ...GatiMitraColors.elevationShadow,
  },
  titleBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: PAD,
    paddingTop: 10,
    paddingBottom: 14,
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
    flexGrow: 1,
    minHeight: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingTop: 14,
  },
  dueFareFloating: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    zIndex: 40,
  },
  dueFareText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#92400E",
    lineHeight: 18,
  },
});
