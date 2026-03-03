import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

export default function OnboardingLayout() {
  return (
    <>
      <AndroidBackHandler />
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="address" />
      <Stack.Screen name="permissions" />
    </Stack>
    </>
  );
}
