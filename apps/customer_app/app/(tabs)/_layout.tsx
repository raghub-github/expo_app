import { Tabs, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { CustomerTabBar, customerTabBarOffset } from "@/components/CustomerTabBar";
import { HomeColdStartSkeleton } from "@/components/home/HomeTabSkeletons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HOME_DARK } from "@/constants/homeDarkTheme";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import {
  fetchProfileWithCache,
  hasCompletedProfileSync,
  readCachedProfile,
} from "@/lib/profileCache";
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
  const [profileGate, setProfileGate] = useState(0);
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
  const sessionRestorePending = useAuthStore((s) => s.sessionRestorePending);
  // Stable reserved height for RN tab bar chrome (transparent). Must match dock math.
  const tabBarHeight = customerTabBarOffset(insets.bottom);

  // Warm profile before yanking to onboarding — FastKV miss was sending returning
  // users to mint "Loading…" onboarding instead of Home skeletons.
  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      if (sessionRestorePending) return;
      router.replace("/(auth)/login");
      return;
    }
    if (hasCompletedProfileSync() || tabsUnlockedRef.current) return;

    let cancelled = false;
    void (async () => {
      const cached = await readCachedProfile();
      if (cancelled) return;
      if (cached?.profile_completed === true) {
        setProfileGate((n) => n + 1);
        return;
      }
      // Completed profiles returned above, so any cached profile here is incomplete.
      if (cached != null) {
        router.replace("/(onboarding)");
        return;
      }
      try {
        const profile = await Promise.race([
          fetchProfileWithCache(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 400)),
        ]);
        if (cancelled) return;
        if (profile?.profile_completed === true) {
          setProfileGate((n) => n + 1);
          return;
        }
        router.replace("/(onboarding)");
      } catch {
        if (!cancelled) router.replace("/(onboarding)");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, accessToken, sessionRestorePending, router, profileGate]);

  const tabsReady = hydrated && Boolean(accessToken) && hasCompletedProfileSync();
  if (tabsReady) tabsUnlockedRef.current = true;

  useLayoutEffect(() => {
    if (tabsUnlockedRef.current) {
      markInitialShellReady("tabs-unlocked");
      return;
    }
    // Keep shell-ready so splash/placeholder can hand off to this skeleton.
    markInitialShellReady("tabs-skeleton-hold");
  }, [tabsReady, profileGate]);

  // Profile still warming — stay on Home skeletons (never blank mint / onboarding spinner).
  if (!tabsUnlockedRef.current) {
    tabDbg("TABS_LAYOUT_NULL", {
      hydrated,
      hasToken: Boolean(accessToken),
      profileSync: hasCompletedProfileSync(),
    });
    return <HomeColdStartSkeleton reason="tabs_unlock_hold" />;
  }

  return (
    <>
      <AndroidBackHandler />
      <Tabs
        tabBar={(props) => <CustomerTabBar {...props} />}
        safeAreaInsets={{ bottom: 0 }}
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
          animation: "none",
          lazy: true,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            headerShown: false,
            lazy: false,
            freezeOnBlur: false,
            sceneStyle: { backgroundColor: HOME_DARK.page },
            // Light status-bar icons over the dark home are applied by
            // StatusBarRouteChromeGuard (applyTabsHomeStatusBar). statusBarStyle /
            // statusBarBackgroundColor are native-stack options that bottom tabs
            // neither type nor read.
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
