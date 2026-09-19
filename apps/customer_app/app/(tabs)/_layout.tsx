import { Tabs, useRouter } from "expo-router";
import { useEffect } from "react";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { CustomerTabBar, customerTabBarOffset } from "@/components/CustomerTabBar";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import {
  CUSTOMER_TAB_TRANSITION_SPEC,
  forCustomerTabSlide,
} from "@/lib/customerTabTransition";
import { hasCompletedProfileSync } from "@/lib/profileCache";
import { useAuthStore } from "@/store/authStore";

/**
 * Tab navigator owns ONE floating CustomerTabBar.
 * Position comes from shared locked safe-area insets — never from page layout height.
 * Screens slide horizontally; the tab bar stays fixed outside the scene animation.
 */
export default function TabsLayout() {
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
    if (!hasCompletedProfileSync()) {
      router.replace("/(onboarding)");
    }
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken || !hasCompletedProfileSync()) {
    return null;
  }

  return (
    <>
      <AndroidBackHandler />
      <Tabs
        tabBar={(props) => <CustomerTabBar {...props} />}
        safeAreaInsets={{ bottom: 0 }}
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
          // Full-width shift — driven entirely by transitionSpec + sceneStyleInterpolator below (no
          // named `animation` preset: bottom-tabs only uses a preset's own spec/interpolator when
          // ours are absent, so setting one here is a no-op that just adds an unused variable).
          // Tab switches are press-only (CustomerTabBar / EdgePeek). Scroll/pan on Home or Food
          // content never calls navigation.navigate / jumpTo — keep that invariant.
          transitionSpec: CUSTOMER_TAB_TRANSITION_SPEC,
          sceneStyleInterpolator: forCustomerTabSlide,
          // Keep Food/Home scenes in the graph so rapid tab presses don't remount mid-slide.
          // Home↔Food authority: `lib/customerPrimaryTabNav` + `navigatePrimaryTab` (not URL flash).
          lazy: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            headerShown: false,
            // freezeOnBlur + AppState resume can leave Home cards/buttons untappable, and —
            // combined with the always-mounted (lazy:false) Food tab + the custom slide transition
            // above — was also the cause of Home→Food tab switches bouncing back to Home within
            // ~1s (react-native-screens freezing/unfreezing Home while its own effects were still
            // settling raced the tab-slide transition). Never freeze Home.
            freezeOnBlur: false,
          }}
        />
        <Tabs.Screen
          name="food"
          options={{
            title: "Food",
            headerShown: false,
            // Same as Home: never freeze during the custom Home↔Food slide.
            // freezeOnBlur:true raced unfreeze mid-transition and briefly snapped
            // the navigator back to Main Home before Food settled.
            freezeOnBlur: false,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: "Orders",
            headerShown: false,
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
