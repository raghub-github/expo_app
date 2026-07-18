import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

export default function HomeLayout() {
  return (
    <>
      <AndroidBackHandler />
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ statusBarTranslucent: true }} />
      <Stack.Screen name="meals-under-price" options={{ statusBarTranslucent: true }} />
      <Stack.Screen name="category/[slug]" />
      <Stack.Screen name="service/[slug]" />
      <Stack.Screen name="service/ride" />
      <Stack.Screen name="service/ride-pickup" />
      <Stack.Screen name="service/ride-map" />
      <Stack.Screen name="service/ride-book" />
      <Stack.Screen name="service/ride-confirm-pickup" />
      <Stack.Screen name="service/ride-searching" />
      <Stack.Screen
        name="merchant/[id]"
        options={{
          animation: "none",
          animationDuration: 0,
          freezeOnBlur: true,
          statusBarTranslucent: false,
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
