import { Tabs, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useRef } from "react";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { CustomerTabBar, customerTabBarOffset } from "@/components/CustomerTabBar";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HOME_DARK } from "@/constants/homeDarkTheme";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import {
  fetchProfileWithCache,
  hasCompletedProfileSync,
  readCachedProfile,
  readSyncCachedProfile,
} from "@/lib/profileCache";
import { useAuthStore } from "@/store/authStore";
import { tabDbg } from "@/lib/tabNavDebug";
import { markInitialShellReady } from "@/lib/startupShellReady";

/**
 * Tab navigator owns ONE floating CustomerTabBar.
 * Position comes from shared locked safe-area insets — never from page layout height.
 * Tab scenes cut instantly (no slide interpolator) so Food never sits behind Home.
 *
 * Cold-start: never block Home behind a second branded skeleton. With a session,
 * mount tabs immediately and reconcile incomplete profiles in the background.
 */
export default function TabsLayout() {
  const profileCheckArmedRef = useRef(false);
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

  // Background profile reconcile — never gate first Home paint on network/disk.
  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      if (sessionRestorePending) return;
      router.replace("/(auth)/login");
      return;
    }
    if (profileCheckArmedRef.current) return;
    profileCheckArmedRef.current = true;

    // Sync-complete → nothing to do. Sync-incomplete → onboarding immediately.
    const sync = readSyncCachedProfile();
    if (sync?.profile_completed === true || hasCompletedProfileSync()) {
      return;
    }
    // After the completed check, any cached profile is incomplete (TS narrows to false).
    if (sync != null) {
      router.replace("/(onboarding)");
      return;
    }

    let cancelled = false;
    void (async () => {
      const cached = await Promise.race([
        readCachedProfile(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 150)),
      ]);
      if (cancelled) return;
      if (cached?.profile_completed === true || hasCompletedProfileSync()) return;
      if (cached != null) {
        router.replace("/(onboarding)");
        return;
      }
      try {
        const profile = await Promise.race([
          fetchProfileWithCache(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 600)),
        ]);
        if (cancelled) return;
        if (profile?.profile_completed === true || hasCompletedProfileSync()) return;
        // Known incomplete → onboarding. Unknown after budget → stay on Home.
        if (profile != null) {
          router.replace("/(onboarding)");
        }
      } catch {
        /* keep Home — do not bounce on transient network */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, accessToken, sessionRestorePending, router]);

  const tabsReady =
    hydrated && (Boolean(accessToken) || sessionRestorePending === false);

  useLayoutEffect(() => {
    // Mark shell ready as soon as tabs can paint — do not wait on profile network.
    if (accessToken || (hydrated && !sessionRestorePending)) {
      markInitialShellReady("tabs-unlocked");
    }
  }, [tabsReady, accessToken, hydrated, sessionRestorePending]);

  // Session restore still pending with no token yet — soft hold without brand splash.
  if (!accessToken) {
    if (!hydrated || sessionRestorePending) {
      tabDbg("TABS_LAYOUT_HOLD", {
        hydrated,
        hasToken: false,
        sessionRestorePending,
      });
      return null;
    }
    return null;
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
