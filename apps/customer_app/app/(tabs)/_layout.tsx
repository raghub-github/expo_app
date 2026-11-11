import { Tabs, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { CustomerTabBar, customerTabBarOffset } from "@/components/CustomerTabBar";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { hasCompletedProfileSync } from "@/lib/profileCache";
import { useAuthStore } from "@/store/authStore";
import { tabDbg } from "@/lib/tabNavDebug";
import { markInitialShellReady } from "@/lib/startupShellReady";

/**
 * Tab navigator owns ONE floating CustomerTabBar.
 * Position comes from shared locked safe-area insets — never from page layout height.
 * Tab scenes cut instantly (no slide interpolator) so Food never sits behind Home.
 */
export default function TabsLayout() {
  const tabsUnlockedRef = useRef(false);
  useEffect(() => {
    tabDbg("INTERPOLATOR_ACTIVE", {
      file: "(tabs)/_layout.tsx",
      durationMs: 0,
      animation: "none",
    });
  }, []);
  const insets = useAppSafeAreaInsets();
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.session?.accessToken ?? null);
  // Stable reserved height for RN tab bar chrome (transparent). Must match dock math.
  const tabBarHeight = customerTabBarOffset(insets.bottom);

  // Hard block: never paint Home/tabs until profile (ID) is created.
  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/(auth)/login");
      return;
    }
    // After tabs have painted, a cache miss must not yank the user to onboarding
    // (that remounts tabs at Home and bounces Food).
    if (!hasCompletedProfileSync() && !tabsUnlockedRef.current) {
      router.replace("/(onboarding)");
    }
  }, [hydrated, accessToken, router]);

  const tabsReady = hydrated && Boolean(accessToken) && hasCompletedProfileSync();
  if (tabsReady) tabsUnlockedRef.current = true;

  useLayoutEffect(() => {
    if (!tabsUnlockedRef.current) return;
    // Tabs chrome is committed under the splash — signal before paint so the
    // mint cover can dismiss as soon as the initial destination is ready.
    markInitialShellReady("tabs-unlocked");
  }, [tabsReady]);

  // Never unmount the tab navigator after it has painted — a brief profile-cache
  // miss remounted tabs at Home and bounced Food → previous page → Food.
  // Soft home bg (not null / not mint) so a brief unlock race never flashes blank teal.
  if (!tabsUnlockedRef.current) {
    tabDbg("TABS_LAYOUT_NULL", {
      hydrated,
      hasToken: Boolean(accessToken),
      profileSync: hasCompletedProfileSync(),
    });
    return <View style={styles.hold} />;
  }

  return (
    <>
      <AndroidBackHandler />
      <Tabs
        tabBar={(props) => <CustomerTabBar {...props} />}
        safeAreaInsets={{ bottom: 0 }}
        // Keep Home/Food native scenes attached. Detaching Food while inactive
        // forces a native reattach on tap, which stalls BottomTabView's slide
        // useEffect and leaves the previous page painted for seconds.
        detachInactiveScreens={false}
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: GatiMitraColors.softBackground },
          headerShadowVisible: false,
          sceneStyle: { backgroundColor: GatiMitraColors.softBackground },
          tabBarStyle: {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: tabBarHeight,
            backgroundColor: "transparent",
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarBackground: () => null,
          freezeOnBlur: true,
          // Instant cut. Passing transitionSpec (even duration 0) keeps BottomTabView
          // in the animated pipeline — incoming Food stays opacity 0 at zIndex 0 while
          // Home stays opaque, so the previous page paints for seconds.
          animation: "none",
          // Cold start: only mount the focused tab (Home). Eager-mounting Food/Orders/
          // Profile pulled multi-second Metro/JS work before Home was usable.
          // Home↔Food still uses animation:"none" + freezeOnBlur:false (no slide race).
          lazy: true,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            headerShown: false,
            // Home is the landing tab — mount immediately; never freeze.
            lazy: false,
            freezeOnBlur: false,
          }}
        />
        <Tabs.Screen
          name="food"
          options={{
            title: "Food",
            headerShown: false,
            freezeOnBlur: false,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: "Orders",
            headerShown: false,
            freezeOnBlur: false,
          }}
        />
        <Tabs.Screen
          name="offers"
          options={{
            title: "Offers",
            headerShown: false,
            href: null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            headerShown: false,
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  hold: {
    flex: 1,
    // Match splash mint while tabs unlock — softBackground read as a white blank.
    backgroundColor: GatiMitraColors.splashMint,
  },
});
