import { Tabs } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { CustomerTabBar, customerTabBarOffset } from "@/components/CustomerTabBar";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import {
  CUSTOMER_TAB_TRANSITION_SPEC,
  forCustomerTabSlide,
} from "@/lib/customerTabTransition";

/**
 * Tab navigator owns ONE floating CustomerTabBar.
 * Position comes from shared locked safe-area insets — never from page layout height.
 * Screens slide horizontally; the tab bar stays fixed outside the scene animation.
 */
export default function TabsLayout() {
  const insets = useAppSafeAreaInsets();
  // Stable reserved height for RN tab bar chrome (transparent). Must match dock math.
  const tabBarHeight = customerTabBarOffset(insets.bottom);

  return (
    <>
      <AndroidBackHandler />
      <Tabs
        tabBar={(props) => <CustomerTabBar {...props} />}
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
          tabBarSafeAreaInsets: { bottom: 0 },
          freezeOnBlur: true,
          // Full-width shift only — single transition owner (no custom Reanimated page slide).
          animation: "shift",
          transitionSpec: CUSTOMER_TAB_TRANSITION_SPEC,
          sceneStyleInterpolator: forCustomerTabSlide,
          // Keep Food/Home scenes in the graph so rapid tab presses don't remount mid-slide.
          lazy: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            headerShown: false,
            freezeOnBlur: true,
          }}
        />
        <Tabs.Screen
          name="food"
          options={{
            title: "Food",
            headerShown: false,
            // Freeze when blurred so returning Food doesn't cold-remount mid-transition.
            freezeOnBlur: true,
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
