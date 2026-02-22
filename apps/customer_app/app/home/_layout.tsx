import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

export default function HomeLayout() {
  return (
    <>
      <AndroidBackHandler />
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="category/[slug]" />
      <Stack.Screen name="service/[slug]" />
      <Stack.Screen name="service/ride" />
      <Stack.Screen name="service/ride-pickup" />
      <Stack.Screen name="service/ride-book" />
      <Stack.Screen name="merchant/[id]" />
      <Stack.Screen name="shop" />
    </Stack>
    </>
  );
}
