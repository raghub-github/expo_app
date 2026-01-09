import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="language" />
      <Stack.Screen name="help" />
      <Stack.Screen name="location" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="aadhaar" />
      <Stack.Screen name="dl-rc" />
      <Stack.Screen name="rental-ev" />
      <Stack.Screen name="pan-selfie" />
      <Stack.Screen name="review" />
      <Stack.Screen name="payment" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="kyc" />
      <Stack.Screen name="pending" />
    </Stack>
  );
}



