import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "react-native-gesture-handler";
import { AppState, LogBox, Platform, StatusBar as RNStatusBar, View } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { Lora_400Regular, Lora_700Bold } from "@expo-google-fonts/lora";
import { Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { GatiMitraMerchant } from "@/constants/theme";
import { StoreStatusProvider } from "@/context/StoreStatusContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { merchantQueryClient } from "@/lib/merchantQueryClient";
import { SelectedStoreProvider } from "@/context/SelectedStoreContext";
import { StoreSettingsProvider } from "@/context/StoreSettingsContext";
import { ActiveTabProvider } from "@/context/ActiveTabContext";
import { OrdersProvider } from "@/context/OrdersContext";
import { ProfileNavProvider } from "@/context/ProfileNavContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { NotificationPermissionGateProvider } from "@/context/NotificationPermissionGateContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import { LiveSupportTicketProvider } from "@/context/LiveSupportTicketContext";
import { FloatingLiveSupportTicket } from "@/components/FloatingLiveSupportTicket";
import LiveOrdersOngoingNotification from "../components/LiveOrdersOngoingNotification";
import LiveOrdersStickyPushRefresh from "../components/LiveOrdersStickyPushRefresh";
import IncomingOrderModal from "../components/IncomingOrderModal";
import IncomingOrderNotificationBridge from "../components/IncomingOrderNotificationBridge";
import AcceptanceTimeoutSync from "../components/AcceptanceTimeoutSync";
import PreventServicesRealtime from "../components/PreventServicesRealtime";
import LearningCentreRealtime from "../components/LearningCentreRealtime";
import ServiceRestrictedNotice from "../components/ServiceRestrictedNotice";
import { IncomingOrderSheetProvider } from "@/context/IncomingOrderSheetContext";
import { SessionRevokedGate } from "@/components/SessionRevokedGate";
import NotificationSetup from "../components/NotificationSetup";
import BackgroundOrderPermissionsGate from "../components/BackgroundOrderPermissionsGate";
import NewOrderAutoOpenHandler from "../components/NewOrderAutoOpenHandler";
import { AppAssetsPrefetch } from "@/components/AppAssetsPrefetch";
import { ensureMerchantAppAssetsLoaded } from "@/store/appAssetsStore";
import { hydrateMenuImageDiskCache } from "@/lib/menuImageDiskCache";
import { hydrateMenuCatalogCache } from "@/lib/menuCatalogCache";
import OrderAlertPushHandler from "../components/OrderAlertPushHandler";
import BackgroundNewOrderLocalAlert from "../components/BackgroundNewOrderLocalAlert";
import StoreStatusPushHandler from "../components/StoreStatusPushHandler";
import WaitingForOrderNotifier from "../components/WaitingForOrderNotifier";
import StoreOnlineStatusNotifier from "../components/StoreOnlineStatusNotifier";
import { NetworkStatusProvider } from "@/context/NetworkStatusContext";
import { OfflineNetworkChrome } from "@/components/OfflineNetworkChrome";
import { PlayInAppUpdateBootstrap } from "@/components/PlayInAppUpdateBootstrap";
import { MerchantReferralAttribution } from "@/components/MerchantReferralAttribution";
import {
  MerchantBootstrapScreen,
  MERCHANT_SPLASH_BG,
} from "@/components/MerchantBootstrapScreen";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

void SplashScreen.preventAutoHideAsync().catch(() => {});

// Expo Go (SDK 53+) cannot do remote push — suppress the package's console.error
// if anything still touches expo-notifications during local development.
LogBox.ignoreLogs([
  "expo-notifications",
  "Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go",
  "[expo-av]",
]);

/** Screens that own a dark canvas and need light status icons. */
const LIGHT_STATUS_BAR_PATH_RE = /packaging-tips/i;

const DEFAULT_STATUS_BAR_BG = GatiMitraMerchant.surfaceWarm;

function applyMerchantStatusBar(opts?: { lightIcons?: boolean; backgroundColor?: string }) {
  const lightIcons = opts?.lightIcons === true;
  const bg = opts?.backgroundColor ?? DEFAULT_STATUS_BAR_BG;
  RNStatusBar.setHidden(false);
  if (Platform.OS === "android") {
    RNStatusBar.setTranslucent(false);
    RNStatusBar.setBackgroundColor(bg);
  }
  RNStatusBar.setBarStyle(lightIcons ? "light-content" : "dark-content");
}

/**
 * Keep the system status bar visible with dark icons on light chrome.
 * Re-applies on route change + AppState resume so modal screens can't leave
 * light-content icons stuck on white headers.
 */
function MerchantStatusBarSync() {
  const pathname = usePathname();
  const lightIcons = LIGHT_STATUS_BAR_PATH_RE.test(pathname ?? "");

  useEffect(() => {
    applyMerchantStatusBar({ lightIcons });
  }, [lightIcons, pathname]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        applyMerchantStatusBar({
          lightIcons: LIGHT_STATUS_BAR_PATH_RE.test(pathname ?? ""),
        });
      }
    });
    return () => sub.remove();
  }, [pathname]);

  return (
    <StatusBar
      style={lightIcons ? "light" : "dark"}
      backgroundColor={lightIcons ? "#0B1A14" : DEFAULT_STATUS_BAR_BG}
      translucent={false}
      hidden={false}
    />
  );
}

/** Don't hold splash forever if font download/cache stalls (common with --offline). */
const FONTS_READY_FALLBACK_MS = 8000;
/** Keep the branded splash on screen long enough to actually be read. */
const MIN_SPLASH_VISIBLE_MS = 1200;

function MerchantStackRecovery({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AppErrorBoundary source="merchant-stack" resetKey={pathname}>
      {children}
    </AppErrorBoundary>
  );
}

function AuthenticatedAppHosts() {
  return (
    <AppErrorBoundary source="merchant-hosts" fallback={() => null}>
      <NotificationSetup />
      <AppAssetsPrefetch />
      <BackgroundOrderPermissionsGate />
      <NewOrderAutoOpenHandler />
      <OrderAlertPushHandler />
      <BackgroundNewOrderLocalAlert />
      <StoreStatusPushHandler />
      <LiveOrdersStickyPushRefresh />
      <WaitingForOrderNotifier />
      <StoreOnlineStatusNotifier />
      <LiveOrdersOngoingNotification />
      <FloatingLiveSupportTicket />
      <IncomingOrderModal />
      <IncomingOrderNotificationBridge />
      <AcceptanceTimeoutSync />
      <PreventServicesRealtime />
      <LearningCentreRealtime />
      <ServiceRestrictedNotice />
      <SessionRevokedGate />
      <MerchantReferralAttribution />
    </AppErrorBoundary>
  );
}

function MerchantNavigator() {
  const { authState } = useAuth();
  const router = useRouter();
  const prevStatus = useRef(authState.status);

  useEffect(() => {
    const wasAuthenticated = prevStatus.current === "authenticated";
    prevStatus.current = authState.status;
    if (wasAuthenticated && authState.status === "unauthenticated") {
      router.replace("/(auth)/welcome");
    }
  }, [authState.status, router]);

  if (authState.status === "loading" || authState.status === "logging_out") {
    return <MerchantBootstrapScreen />;
  }

  const signedIn = authState.status === "authenticated";

  return (
    <>
      {signedIn ? <AuthenticatedAppHosts /> : <AppAssetsPrefetch />}
      <MerchantStackRecovery>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: GatiMitraMerchant.background },
            animation: "slide_from_right",
            statusBarHidden: false,
            statusBarStyle: "dark",
            statusBarTranslucent: false,
            statusBarBackgroundColor: GatiMitraMerchant.surfaceWarm,
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          {signedIn ? (
            <>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="order-review/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="feedback-reply/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="order-history" options={{ headerShown: false }} />
              <Stack.Screen name="restaurant-status" options={{ headerShown: false }} />
              <Stack.Screen name="support/chat/[ticketId]" options={{ headerShown: false }} />
            </>
          ) : null}
        </Stack>
      </MerchantStackRecovery>
      {signedIn ? <OfflineNetworkChrome /> : null}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    Lora_400Regular,
    Lora_700Bold,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [fontsTimedOut, setFontsTimedOut] = useState(false);
  const [splashExited, setSplashExited] = useState(false);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const typographyReady = fontsLoaded || fontsTimedOut;

  useEffect(() => {
    const t = setTimeout(() => setFontsTimedOut(true), FONTS_READY_FALLBACK_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Keep the native image splash visible until Lora has been registered.
    // Rendering branded copy before this point makes React Native permanently
    // measure its first frame with the system fallback font.
    if (!typographyReady) return;
    const t = setTimeout(() => setMinSplashElapsed(true), MIN_SPLASH_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [typographyReady]);

  useEffect(() => {
    if (fontsError && __DEV__) {
      console.warn("[typography] useFonts error:", fontsError);
    }
  }, [fontsError]);

  useEffect(() => {
    if (fontsTimedOut && !fontsLoaded && __DEV__) {
      console.warn(
        "[typography] Fonts not ready after timeout — Lora/Poppins may look like system font"
      );
    }
  }, [fontsTimedOut, fontsLoaded]);

  useEffect(() => {
    // CMS assets must never block first paint — AppAssetsPrefetch dedupes the fetch.
    void ensureMerchantAppAssetsLoaded();
    void hydrateMenuImageDiskCache();
    void hydrateMenuCatalogCache();
  }, []);

  // Prefer real font registration; only soft-timeout so login is never blocked forever.
  const ready = typographyReady;

  /** Native splash must drop as soon as the branded JS splash has painted. */
  const handleSplashReady = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleSplashExitComplete = useCallback(() => {
    setSplashExited(true);
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={merchantQueryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthProvider>
            <MerchantAppShell
              typographyReady={ready}
              fontsLoaded={fontsLoaded}
              fontsTimedOut={fontsTimedOut}
              minSplashElapsed={minSplashElapsed}
              splashExited={splashExited}
              onSplashReady={handleSplashReady}
              onSplashExitComplete={handleSplashExitComplete}
            />
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

function MerchantAppShell({
  typographyReady,
  fontsLoaded,
  fontsTimedOut,
  minSplashElapsed,
  splashExited,
  onSplashReady,
  onSplashExitComplete,
}: {
  typographyReady: boolean;
  fontsLoaded: boolean;
  fontsTimedOut: boolean;
  minSplashElapsed: boolean;
  splashExited: boolean;
  onSplashReady: () => void;
  onSplashExitComplete: () => void;
}) {
  const { authState } = useAuth();
  const authReady = authState.status !== "loading";
  const appReady = typographyReady && minSplashElapsed && authReady;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: splashExited ? GatiMitraMerchant.background : MERCHANT_SPLASH_BG,
      }}
    >
      {typographyReady ? (
        <NetworkStatusProvider>
          <SelectedStoreProvider>
            <LiveSupportTicketProvider>
              <StoreStatusProvider>
                <StoreSettingsProvider>
                  <ActiveTabProvider>
                    <OrdersProvider>
                      <ProfileNavProvider>
                        <NotificationProvider>
                          <NotificationPermissionGateProvider>
                            <SubscriptionProvider>
                              <MerchantStatusBarSync />
                              <IncomingOrderSheetProvider>
                                {authReady && minSplashElapsed ? <MerchantNavigator /> : null}
                                <PlayInAppUpdateBootstrap />
                              </IncomingOrderSheetProvider>
                            </SubscriptionProvider>
                          </NotificationPermissionGateProvider>
                        </NotificationProvider>
                      </ProfileNavProvider>
                    </OrdersProvider>
                  </ActiveTabProvider>
                </StoreSettingsProvider>
              </StoreStatusProvider>
            </LiveSupportTicketProvider>
          </SelectedStoreProvider>
        </NetworkStatusProvider>
      ) : null}
      {!splashExited && typographyReady ? (
        <MerchantBootstrapScreen
          variant="root"
          appReady={appReady}
          statusMessage={
            fontsTimedOut && !fontsLoaded ? "Starting GatiMitra Partner..." : null
          }
          onSplashReady={onSplashReady}
          onExitComplete={onSplashExitComplete}
        />
      ) : null}
    </View>
  );
}
