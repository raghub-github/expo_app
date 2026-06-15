/**
 * Home – GatiMitra reference UI: header, weather, promo, services, brand banner.
 * Fixed one-screen layout — no vertical scroll.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useLocationStore } from "@/store/locationStore";
import { HomeLocationHeader, HomeWeatherBanner } from "@/components/home/HomeScreenHeader";
import { HomePromoCarousel } from "@/components/home/HomePromoCarousel";
import { HomeServicesRow } from "@/components/home/HomeServicesRow";
import { HomeBrandBanner } from "@/components/home/HomeBrandBanner";
import { WeatherDetailsSheet } from "@/components/weather";
import { useLocationWeather } from "@/hooks/useLocationWeather";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { prefetchAddresses } from "@/hooks/useAddresses";
import { resolveWeatherCityFromAddress } from "@/lib/weather-location";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useHomeScreenLayout } from "@/hooks/useHomeScreenLayout";
import {
  prefetchFeaturedOffersHome,
  useFeaturedOffersHome,
} from "@/hooks/useFeaturedOffersHome";
import { useCustomerGeoServiceAvailability } from "@/hooks/useCustomerGeoServiceAvailability";

const BG = "#FFFFFF";
const TEAL = GatiMitraColors.splashMint;
const TAB_BAR_H = 56;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [weatherSheetVisible, setWeatherSheetVisible] = useState(false);
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const locationSource = useLocationStore((s) => s.locationSource);
  const coords = useLocationStore((s) => s.coords);
  const { address, requestPermissionAndFetch, refetchLocation } = useLocationStore();
  const debouncedCoords = useDebouncedCoords(coords);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["addresses"] }),
        queryClient.invalidateQueries({ queryKey: ["active-location"] }),
        queryClient.invalidateQueries({ queryKey: ["featured-offers-home"] }),
        queryClient.invalidateQueries({ queryKey: ["geo", "services"] }),
      ]);
      if (locationSource !== "selected") {
        await refetchLocation();
      }
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, locationSource, refetchLocation]);

  useEffect(() => {
    if (!locationHydrated) return;
    if (locationSource === "selected" && coords) return;
    if (locationSource === "current" && coords) return;
    requestPermissionAndFetch();
  }, [locationHydrated, locationSource, coords, requestPermissionAndFetch]);

  useEffect(() => {
    void prefetchAddresses(queryClient);
  }, [queryClient]);

  const isPincode = (value?: string | null) => !!value && /^\d{6}$/.test(value.trim());
  const fullParts = (address?.fullAddress ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const secondaryParts = (address?.secondary ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const stateCandidate =
    address?.state ??
    [...fullParts].reverse().find((p) => !isPincode(p) && p.toLowerCase() !== "india");
  const { enabledServices } = useCustomerGeoServiceAvailability();
  const normalizedState = stateCandidate?.toLowerCase() ?? "";
  const areaLocalityCandidates = [...secondaryParts, ...fullParts, address?.primary ?? ""]
    .map((p) => p.trim())
    .filter(
      (p) =>
        !!p &&
        !isPincode(p) &&
        p.toLowerCase() !== "india" &&
        p.toLowerCase() !== normalizedState
    );
  const dedupedAreaLocality = Array.from(new Set(areaLocalityCandidates));
  const locationPrimary = dedupedAreaLocality.slice(0, 2).join(", ") || "Current location";
  const locationSecondary = stateCandidate ?? "Turn on location for accurate address";
  const weatherCity = useMemo(
    () =>
      resolveWeatherCityFromAddress({
        city: address?.city,
        state: address?.state ?? stateCandidate,
        fullAddress: address?.fullAddress,
        areaFallback: locationPrimary,
      }),
    [address?.city, address?.state, address?.fullAddress, stateCandidate, locationPrimary]
  );
  const { data: weather } = useLocationWeather({
    lat: debouncedCoords?.latitude,
    lng: debouncedCoords?.longitude,
    area: locationPrimary,
    city: weatherCity,
  });

  const showWeather =
    weather != null && weather.temperatureC != null && Number.isFinite(weather.temperatureC);
  const { promoCardH, serviceCardH, brandH } = useHomeScreenLayout(showWeather);

  const offerLocationParams = useMemo(
    () => ({
      pincode: address?.pincode?.trim() || undefined,
      state: address?.state?.trim() || undefined,
      city: address?.city?.trim() || undefined,
      lat: debouncedCoords?.latitude,
      lng: debouncedCoords?.longitude,
    }),
    [
      address?.pincode,
      address?.state,
      address?.city,
      debouncedCoords?.latitude,
      debouncedCoords?.longitude,
    ]
  );

  useEffect(() => {
    if (!locationHydrated) return;
    void prefetchFeaturedOffersHome(queryClient, offerLocationParams);
  }, [locationHydrated, offerLocationParams, queryClient]);

  const { data: featuredOffersData } = useFeaturedOffersHome(
    offerLocationParams,
    locationHydrated
  );

  return (
    <View style={styles.container}>
      <HomeLocationHeader
        locationPrimary={locationPrimary}
        locationSecondary={locationSecondary}
        onLocationPress={() => router.push("/location")}
        onSearchPress={() => router.push("/search")}
        onNotificationPress={() => router.push("/notifications")}
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          { paddingBottom: insets.bottom + TAB_BAR_H },
        ]}
        scrollEnabled={false}
        bounces={false}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} colors={[TEAL]} />
        }
      >
        <HomeWeatherBanner
          weather={weather}
          onWeatherPress={() => setWeatherSheetVisible(true)}
        />

        <HomePromoCarousel
          offers={featuredOffersData?.offers}
          cardHeight={promoCardH}
          mode="home"
        />

        <HomeServicesRow cardHeight={serviceCardH} enabledServices={enabledServices} />

        <View style={styles.brandSpacer} />
        <HomeBrandBanner bannerHeight={brandH} />
      </ScrollView>

      <WeatherDetailsSheet
        visible={weatherSheetVisible}
        weather={weather}
        onClose={() => setWeatherSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
  },
  brandSpacer: {
    flex: 1,
    minHeight: 10,
  },
});
