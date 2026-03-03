import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

export default function OrdersLayout() {
  return (
    <>
      <AndroidBackHandler />
      <Stack
      screenOptions={{
        headerShown: true,
        headerStatusBarHeight: 0,
      }}
    >
      <Stack.Screen name="[id]" options={{ title: "Order tracking" }} />
    </Stack>
    </>
  );
}
