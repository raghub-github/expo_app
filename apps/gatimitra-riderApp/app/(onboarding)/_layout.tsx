import { Stack } from "expo-router";
import { RIDER_AUTH_BG } from "@/src/theme/riderAuthTheme";

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f4fbf6' } }}>
      <Stack.Screen name="method-selection" />
      <Stack.Screen name="language" options={{ contentStyle: { backgroundColor: RIDER_AUTH_BG } }} />
      <Stack.Screen name="help" />
      <Stack.Screen name="location" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="referral" />
      <Stack.Screen name="aadhaar" />
      <Stack.Screen name="dl-rc" />
      <Stack.Screen name="rental-ev" />
      <Stack.Screen name="pan-selfie" />
      <Stack.Screen name="bank-account" />
      <Stack.Screen name="review" />
      <Stack.Screen name="payment" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="kyc" />
      <Stack.Screen name="pending" />
    </Stack>
  );
}



