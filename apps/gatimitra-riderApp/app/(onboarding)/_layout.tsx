import { Stack } from "expo-router";
import { View } from "react-native";
import { RIDER_AUTH_BG } from "@/src/theme/riderAuthTheme";
import { OnboardingTopBar } from "@/src/components/onboarding/OnboardingTopBar";
import { RiderLogoutSheetHost } from "@/src/components/profile/RiderLogoutSheetHost";

export default function OnboardingLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          // Floating top bar on every step: back (to the previous step) + a ⋮ menu with
          // Logout and "Need help / Raise a ticket". headerTransparent so it overlays each
          // screen's own layout without shifting content.
          headerShown: true,
          headerTransparent: true,
          header: (props) => <OnboardingTopBar route={props.route} />,
          contentStyle: { backgroundColor: "#f4fbf6" },
        }}
      >
        <Stack.Screen name="method-selection" />
        <Stack.Screen name="language" options={{ contentStyle: { backgroundColor: RIDER_AUTH_BG } }} />
        <Stack.Screen name="help" options={{ headerShown: false }} />
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
      {/* Mounted here so Logout from the onboarding ⋮ menu works before onboarding completes
          (previously the logout sheet host lived only in the (tabs) layout). */}
      <RiderLogoutSheetHost />
    </View>
  );
}
