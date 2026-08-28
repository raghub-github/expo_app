import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { useDiscoveryLayout } from "@/hooks/useDiscoveryLayout";
import { DiscoveryColors } from "@/features/discovery-home/discoveryTheme";

export default function HomeLayout() {
  const discovery = useDiscoveryLayout();
  const barStyle = discovery ? "light" : "dark";
  const barBg = discovery ? DiscoveryColors.bg : "#FFFFFF";

  return (
    <>
      <AndroidBackHandler />
      <Stack
        screenOptions={{
          headerShown: false,
          statusBarHidden: false,
          statusBarStyle: "dark",
          /**
           * Screens below the top of this stack stop re-rendering while blurred
           * (same fix as the root stack, see app/_layout.tsx). Without this, the
           * ride-booking flow (ride → ride-book → ride-pickup → ride-confirm-pickup
           * → ride-searching) leaves every earlier screen mounted and un-frozen —
           * including their live native Mapbox maps — as the user pushes forward,
           * which is real GPU/memory pressure on low-end devices, not just wasted
           * render work. Effects/subscriptions are unaffected, so live tracking
           * data is still current when a screen is popped back to.
           */
          freezeOnBlur: true,
        }}
      >
      <Stack.Screen
        name="index"
        options={{
          statusBarTranslucent: true,
          statusBarHidden: false,
          statusBarStyle: barStyle,
          statusBarBackgroundColor: barBg,
          navigationBarColor: barBg,
          // Opaque native surface — translucent status bar otherwise shows
          // the previous route (tabs / merchant) through discovery home.
          contentStyle: { backgroundColor: barBg },
        }}
      />
      <Stack.Screen
        name="grocery"
        options={{
          statusBarTranslucent: true,
          statusBarHidden: false,
          statusBarStyle: barStyle,
          statusBarBackgroundColor: "transparent",
          navigationBarColor: barBg,
          contentStyle: { backgroundColor: barBg },
        }}
      />
      <Stack.Screen
        name="meals-under-price"
        options={{
          statusBarTranslucent: true,
          statusBarHidden: false,
          statusBarStyle: barStyle,
          statusBarBackgroundColor: barBg,
          contentStyle: { backgroundColor: barBg },
        }}
      />
      <Stack.Screen
        name="free-packaging"
        options={{
          statusBarTranslucent: true,
          statusBarHidden: false,
          statusBarStyle: "light",
          statusBarBackgroundColor: DiscoveryColors.bg,
          contentStyle: { backgroundColor: DiscoveryColors.bg },
        }}
      />
      <Stack.Screen
        name="crazy-deals"
        options={{
          statusBarTranslucent: true,
          statusBarHidden: false,
          statusBarStyle: "light",
          statusBarBackgroundColor: DiscoveryColors.bg,
          contentStyle: { backgroundColor: DiscoveryColors.bg },
        }}
      />
      <Stack.Screen
        name="category/[slug]"
        options={{
          statusBarTranslucent: true,
          statusBarHidden: false,
          statusBarStyle: barStyle,
          statusBarBackgroundColor: barBg,
          contentStyle: { backgroundColor: barBg },
        }}
      />
      <Stack.Screen name="service/[slug]" />
      <Stack.Screen name="service/ride" />
      <Stack.Screen name="service/ride-pickup" />
      <Stack.Screen name="service/ride-map" />
      <Stack.Screen name="service/ride-book" />
      <Stack.Screen name="service/ride-confirm-pickup" />
      <Stack.Screen name="service/ride-searching" />
      <Stack.Screen name="service/parcel-book" />
      <Stack.Screen name="service/parcel-searching" />
      <Stack.Screen
        name="merchant/[id]"
        options={{
          animation: "none",
          animationDuration: 0,
          statusBarTranslucent: true,
          statusBarHidden: false,
          statusBarStyle: barStyle,
          statusBarBackgroundColor: "transparent",
          navigationBarColor: barBg,
          // Match shutter / skeleton — never flash a grey/blank route.
          contentStyle: { backgroundColor: barBg },
          gestureEnabled: true,
        }}
      />
      <Stack.Screen name="shop" />
    </Stack>
    </>
  );
}
