import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

export default function HomeLayout() {
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
           * including their live Mapbox WebView maps — as the user pushes forward,
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
          statusBarStyle: "dark",
        }}
      />
      <Stack.Screen
        name="meals-under-price"
        options={{
          statusBarTranslucent: true,
          statusBarHidden: false,
          statusBarStyle: "dark",
        }}
      />
      <Stack.Screen name="category/[slug]" />
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
          statusBarTranslucent: false,
          statusBarHidden: false,
          statusBarStyle: "dark",
          statusBarBackgroundColor: "#FFFFFF",
          // Match shutter / skeleton — never flash a grey/blank route.
          contentStyle: { backgroundColor: "#FFFFFF" },
          gestureEnabled: true,
        }}
      />
      <Stack.Screen name="shop" />
    </Stack>
    </>
  );
}
