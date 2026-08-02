/**
 * Home – GatiMitra reference UI: header, weather, promo, services, brand banner.
 * Fixed one-screen layout — no vertical scroll.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, StatusBar as NativeStatusBar, Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveCustomerBottomNavHeight } from "@/constants/layout";
import { useLocationStore } from "@/store/locationStore";
import { useActiveLocationReconcileReady } from "@/hooks/useActiveLocationReconcileReady";
import { HomeLocationHeader, HomeWeatherBanner } from "@/components/home/HomeScreenHeader";
import { HomePromoCarousel } from "@/components/home/HomePromoCarousel";
import { HomeServicesRow } from "@/components/home/HomeServicesRow";
import { HomeBrandBanner } from "@/components/home/HomeBrandBanner";
import { WeatherDetailsSheet } from "@/components/weather";
import { useLocationWeather } from "@/hooks/useLocationWeather";
import { prefetchAddresses } from "@/hooks/useAddresses";
import { resolveHomeLocationPrimary, resolveHomeWeatherQueryParams } from "@/lib/weather-location";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useHomeScreenLayout } from "@/hooks/useHomeScreenLayout";
import {
  prefetchFeaturedOffersHome,
  useFeaturedOffersHome,
} from "@/hooks/useFeaturedOffersHome";
import { reloadCustomerAppAssets } from "@/store/appAssetsStore";
import { useCustomerGeoServiceAvailability } from "@/hooks/useCustomerGeoServiceAvailability";
import { useScreenChromeStore } from "@/store/screenChromeStore";

const BG = "#FFFFFF";
const TEAL = GatiMitraColors.splashMint;
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
  const reconcileReady = useActiveLocationReconcileReady();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["addresses"] }),
        queryClient.invalidateQueries({ queryKey: ["active-location"] }),
        queryClient.invalidateQueries({ queryKey: ["featured-offers-home"] }),
        queryClient.invalidateQueries({ queryKey: ["weather"] }),
        queryClient.invalidateQueries({ queryKey: ["geo", "services"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet", "balance"] }),
        reloadCustomerAppAssets(),
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
    if (!reconcileReady) return;
    if (locationSource === "selected" && coords) return;
    if (locationSource === "current" && coords) return;
    requestPermissionAndFetch();
  }, [locationHydrated, reconcileReady, locationSource, coords, requestPermissionAndFetch]);

  useEffect(() => {
    void prefetchAddresses(queryClient);
  }, [queryClient]);

  const isPincode = (value?: string | null) => !!value && /^\d{6}$/.test(value.trim());
  const fullParts = (address?.fullAddress ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const stateCandidate =
    address?.state ??
    [...fullParts].reverse().find((p) => !isPincode(p) && p.toLowerCase() !== "india");
  const { enabledServices } = useCustomerGeoServiceAvailability();
  const weatherParams = useMemo(
    () => (coords ? resolveHomeWeatherQueryParams(address, coords) : { lat: undefined, lng: undefined }),
    [address, coords]
  );
  const locationPrimary = resolveHomeLocationPrimary(address);
  const locationSecondary = stateCandidate ?? "Turn on location for accurate address";
  const { data: weather, isFetching: weatherFetching } = useLocationWeather(weatherParams);

  const hasLiveWeather =
    weather != null && weather.temperatureC != null && Number.isFinite(weather.temperatureC);
  const showWeatherBlock = hasLiveWeather || (coords != null && weatherFetching && !hasLiveWeather);
  const { promoCardH, serviceCardH, brandH } = useHomeScreenLayout(showWeatherBlock);

  const offerLocationParams = useMemo(
    () => ({
      pincode: address?.pincode?.trim() || undefined,
      state: address?.state?.trim() || undefined,
      city: address?.city?.trim() || undefined,
      lat: coords?.latitude,
      lng: coords?.longitude,
    }),
    [
      address?.pincode,
      address?.state,
      address?.city,
      coords?.latitude,
      coords?.longitude,
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

  // Restore solid, visible status-bar chrome — immersive / modals can leave it off
  // or paint a dark window root that hides dark status icons.
  useFocusEffect(
    useCallback(() => {
      NativeStatusBar.setHidden(false, "none");
      if (Platform.OS === "android") {
        NativeStatusBar.setTranslucent(false);
        NativeStatusBar.setBackgroundColor("#FFFFFF", true);
        NativeStatusBar.setBarStyle("dark-content", true);
      }
      useScreenChromeStore.setState({
        statusBarBackground: "#FFFFFF",
        statusBarStyle: "dark",
        hideStatusBarSpacer: false,
      });
    }, [])
  );

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" translucent={false} hidden={false} />
      <HomeLocationHeader
        locationPrimary={locationPrimary}
        locationSecondary={locationSecondary}
        onLocationPress={() => router.push("/location")}
        onNotificationPress={() => router.push("/notifications")}
      />

      <HomeWeatherBanner
        weather={weather}
        loading={coords != null && weatherFetching && !hasLiveWeather}
        onWeatherPress={() => setWeatherSheetVisible(true)}
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          { paddingBottom: resolveCustomerBottomNavHeight(insets.bottom) },
        ]}
        scrollEnabled={false}
        bounces={false}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} colors={[TEAL]} />
        }
      >
        <HomePromoCarousel
          offers={featuredOffersData?.offers}
          cardHeight={promoCardH}
          mode="home"
          showDefaultWhenEmpty
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
