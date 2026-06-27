import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

export default function OrdersLayout() {
  return (
    <>
      <AndroidBackHandler />
      <Stack
      screenOptions={{
        headerShown: true,
      }}
    >
      {/* Hide the native stack header on the tracking screen — the screen
          renders its own header with merchant name + order id + help button.
          The duplicate "Order tracking" bar above looked broken. */}
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
