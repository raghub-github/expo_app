import { Stack } from "expo-router";

export default function OrdersLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStatusBarHeight: 0,
      }}
    >
      <Stack.Screen name="[id]" options={{ title: "Order tracking" }} />
    </Stack>
  );
}
