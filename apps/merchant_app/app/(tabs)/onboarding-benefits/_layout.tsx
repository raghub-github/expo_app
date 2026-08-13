import { Stack } from "expo-router";

export default function OnboardingBenefitsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, freezeOnBlur: false, animation: "none" }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="packaging-tips" />
    </Stack>
  );
}
