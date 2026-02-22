import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

export default function GroupLayout() {
  return (
    <>
      <AndroidBackHandler />
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[groupOrderId]" />
    </Stack>
    </>
  );
}
