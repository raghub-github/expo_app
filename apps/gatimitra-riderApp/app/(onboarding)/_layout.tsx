import { Stack } from "expo-router";
import { View } from "react-native";
import { RIDER_AUTH_BG } from "@/src/theme/riderAuthTheme";
import {
  OnboardingTopBar,
  ONBOARDING_PAGE_BG,
} from "@/src/components/onboarding/OnboardingTopBar";
import { RiderLogoutSheetHost } from "@/src/components/profile/RiderLogoutSheetHost";

/**
 * File-based routes register screens automatically — only override options here. Listing every
 * Stack.Screen caused NativeWind wrap-jsx + React Navigation useSyncState to thrash (Maximum
 * update depth) on mount, so the list is kept minimal (only screens that need a real override).
 */
export default function OnboardingLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: ONBOARDING_PAGE_BG }}>
      <Stack
        screenOptions={{
          // Floating top bar on every step: back (to the previous step) + a ⋮ menu with
          // Logout and "Need help / Raise a ticket". headerTransparent so it overlays each
          // screen's own layout without shifting content.
          headerShown: true,
          headerTransparent: true,
          headerStyle: { backgroundColor: ONBOARDING_PAGE_BG },
          header: (props) => <OnboardingTopBar route={props.route} />,
          contentStyle: { flex: 1, width: "100%", backgroundColor: ONBOARDING_PAGE_BG },
          animation: "fade",
        }}
      >
        <Stack.Screen
          name="language"
          options={{ contentStyle: { flex: 1, width: "100%", backgroundColor: RIDER_AUTH_BG } }}
        />
        {/* help is a redirect — no top bar needed. */}
        <Stack.Screen name="help" options={{ headerShown: false }} />
      </Stack>
      {/* Mounted here so Logout from the onboarding ⋮ menu works before onboarding completes
          (previously the logout sheet host lived only in the (tabs) layout). */}
      <RiderLogoutSheetHost />
    </View>
  );
}
