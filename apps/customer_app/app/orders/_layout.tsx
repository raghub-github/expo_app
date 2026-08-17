import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

export default function OrdersLayout() {
  return (
    <>
      <AndroidBackHandler />
      <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* Screens own their headers — avoid native Stack title duplicating in-app titles. */}
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
      <Stack.Screen name="partner-chat" options={{ headerShown: false }} />
      <Stack.Screen name="raise-ticket" options={{ headerShown: false }} />
      <Stack.Screen name="support-ticket-submit" options={{ headerShown: false }} />
      <Stack.Screen name="payment-success" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="payment-failure" options={{ headerShown: false, gestureEnabled: false }} />
    </Stack>
    </>
  );
}
