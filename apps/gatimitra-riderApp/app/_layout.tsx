// IMPORTANT: Setup must run FIRST - installs error suppression before any other imports
import "@/src/utils/setup";

import FontAwesome from "@expo/vector-icons/FontAwesome";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Lora_400Regular, Lora_600SemiBold, Lora_700Bold } from "@expo-google-fonts/lora";
import {
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { View, Text, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/components/useColorScheme";
import { AppProviders } from "@/src/providers/AppProviders";
import { usePermissionStore } from "@/src/stores/permissionStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useLanguageStore } from "@/src/stores/languageStore";
import { colors } from "@/src/theme";
import { RiderFonts } from "@/src/theme/fonts";
import { RiderPushSetup } from "@/src/components/RiderPushSetup";
import { RiderPendingReferralResume } from "@/src/components/RiderPendingReferralResume";
import { RiderDispatchRealtime } from "@/src/components/RiderDispatchRealtime";
import { RiderDispatchKeepAlive } from "@/src/components/RiderDispatchKeepAlive";
import { PreventServicesRealtime } from "@/src/components/PreventServicesRealtime";
import { ServiceRestrictedSheet } from "@/src/components/ServiceRestrictedSheet";
import { RiderDutyLocationPing } from "@/src/components/RiderDutyLocationPing";
import { isRiderWsEnabled } from "@/src/config/env";
import { IncomingRideOrderHost } from "@/src/components/orders/IncomingRideOrderHost";
import { SubscriptionDutyBlockedSheetHost } from "@/src/components/subscription/SubscriptionDutyBlockedSheetHost";
import { RiderPaymentSuccessSheet } from "@/src/components/ui/RiderPaymentSuccessSheet";
import { ActiveOrderResumeBootstrap } from "@/src/components/orders/ActiveOrderResumeBootstrap";
import { RiderPostDeliveryTipHost } from "@/src/components/orders/RiderPostDeliveryTipHost";
import { RiderToastHost } from "@/src/components/RiderToastHost";
import { initializeMapbox } from "@/src/services/maps/mapbox";
import { fetchRiderAppAssets } from "@/src/services/appAssets.service";
import { useAppAssetsStore } from "@/src/stores/appAssetsStore";
import { hydrateRiderSubscriptionCache } from "@/src/lib/rider-subscription-cache";

/** Local icon glyphs — short wait so lang/bell/tabs never paint as empty squares. */
const ICON_FONT_TIMEOUT_MS = 1_200;

if (Platform.OS !== "web") {
  try {
    initializeMapbox();
  } catch (error) {
    console.warn("[RootLayout] Failed to initialize Mapbox early:", error);
  }
}

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync().catch(() => {
  // Expo Go / some Android builds cannot activate keep-awake — non-fatal
});

export default function RootLayout() {
  const [iconFontsTimedOut, setIconFontsTimedOut] = useState(false);
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    Lora_400Regular,
    Lora_600SemiBold,
    Lora_700Bold,
    Poppins_600SemiBold,
    Poppins_700Bold,
    ...FontAwesome.font,
    ...Ionicons.font,
    ...MaterialIcons.font,
  });

  const chromeFontsReady = loaded || iconFontsTimedOut;

  useEffect(() => {
    void hydrateRiderSubscriptionCache();
  }, []);

  useEffect(() => {
    if (useAppAssetsStore.getState().loaded) return;
    void fetchRiderAppAssets()
      .then((res) => useAppAssetsStore.getState().setAssets(res.assets ?? {}))
      .catch(() => useAppAssetsStore.getState().setAssets({}));
  }, []);

  useEffect(() => {
    if (loaded || iconFontsTimedOut) return;
    const t = setTimeout(() => setIconFontsTimedOut(true), ICON_FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [loaded, iconFontsTimedOut]);

  useEffect(() => {
    if (error) console.warn("[RootLayout] Font loading error:", error);
  }, [error]);

  useEffect(() => {
    if (!chromeFontsReady) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [chromeFontsReady]);

  // Always mount the navigator on first render. Returning a blank View here
  // triggers Expo Router: "Attempted to navigate before mounting the Root Layout".
  try {
    return <RootLayoutNav />;
  } catch (renderError) {
    console.warn("[RootLayout] Error rendering RootLayoutNav:", renderError);
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" }}>
        <Text style={{ color: "#000000", fontSize: 16, fontFamily: RiderFonts.loraBold }}>
          Render Error
        </Text>
        <Text style={{ color: "#666666", marginTop: 8 }}>{String(renderError)}</Text>
      </View>
    );
  }
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const hydratePermissions = usePermissionStore((s) => s.hydrate);
  const hydrateSession = useSessionStore((s) => s.hydrate);
  const hydrateLanguage = useLanguageStore((s) => s.hydrate);

  useEffect(() => {
    void hydratePermissions();
    void hydrateSession();
    void hydrateLanguage().catch(() => undefined);
  }, [hydratePermissions, hydrateSession, hydrateLanguage]);

  // Render navigation immediately — stores hydrate in background (no "Initializing..." blank).
  try {
    return (
      <AppProviders>
        <StatusBar style="dark" />
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <RiderPushSetup />
          <RiderPendingReferralResume />
          <RiderDutyLocationPing />
          <ActiveOrderResumeBootstrap />
          <RiderDispatchKeepAlive />
          <PreventServicesRealtime />
          <ServiceRestrictedSheet />
          {isRiderWsEnabled() ? <RiderDispatchRealtime /> : null}

          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#ffffff" },
            }}
          >
            <Stack.Screen
              name="index"
              options={{ contentStyle: { backgroundColor: "#C4E8D1" } }}
            />
            <Stack.Screen name="(permissions)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="view-profile" />
            <Stack.Screen name="view-documents" />
            <Stack.Screen name="view-vehicle" />
            <Stack.Screen name="referrals" />
            <Stack.Screen name="referral-details/[filter]" />

            <Stack.Screen name="payment-details" />
            <Stack.Screen name="payout-accounts" />

            <Stack.Screen name="notification-settings" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="raise-ticket" />
            <Stack.Screen name="raise-ticket-flow" />
            <Stack.Screen name="raise-ticket-chat" />
            <Stack.Screen name="my-tickets" />
            <Stack.Screen name="my-rides" />
            <Stack.Screen name="order-history/[id]" />
            <Stack.Screen name="ticket-chat/[id]" />
            <Stack.Screen name="team-leader" />
            <Stack.Screen name="your-subscription" />
            <Stack.Screen name="active-ride/[id]" />
            <Stack.Screen name="active-food/[id]" />
            <Stack.Screen
              name="food-delivery-success"
              options={{
                gestureEnabled: false,
                animation: "fade",
                contentStyle: { flex: 1, backgroundColor: "#ffffff" },
              }}
            />
            <Stack.Screen
              name="ride-payment-waiting"
              options={{
                gestureEnabled: false,
                animation: "fade",
                contentStyle: { flex: 1, backgroundColor: "#ffffff" },
              }}
            />
            <Stack.Screen
              name="ride-delivery-success"
              options={{
                gestureEnabled: false,
                animation: "fade",
                contentStyle: { flex: 1, backgroundColor: "#ffffff" },
              }}
            />
            <Stack.Screen name="modal" options={{ presentation: "modal" }} />
          </Stack>

          <IncomingRideOrderHost />
          <SubscriptionDutyBlockedSheetHost />
          <RiderPaymentSuccessSheet />
          <RiderPostDeliveryTipHost />
          <RiderToastHost />
        </ThemeProvider>
      </AppProviders>
    );
  } catch (navError) {
    console.warn("[RootLayoutNav] Error rendering navigation:", navError);
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.background.light,
        }}
      >
        <Text style={{ color: colors.error[500], fontSize: 16, fontFamily: RiderFonts.loraBold }}>
          Navigation Error
        </Text>
        <Text
          style={{
            color: colors.text.primary.light,
            marginTop: 8,
            fontFamily: RiderFonts.loraRegular,
          }}
        >
          Please restart the app
        </Text>
      </View>
    );
  }
}
