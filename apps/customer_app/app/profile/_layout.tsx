import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEFAULT_STATUS_BAR_HEIGHT } from "@/constants/layout";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

const HEADER_BG = "#FFFFFF";

export default function ProfileLayout() {
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top > 0 ? insets.top : DEFAULT_STATUS_BAR_HEIGHT;
  return (
    <>
      <AndroidBackHandler />
      <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: HEADER_BG },
        headerTintColor: "#1A1A1A",
        headerTitleStyle: { fontWeight: "700", fontSize: 18 },
        headerShadowVisible: false,
        headerStatusBarHeight: statusBarHeight,
      }}
    >
      <Stack.Screen name="referrals" options={{ title: "Rewards & Referrals" }} />
      <Stack.Screen name="addresses" options={{ title: "Saved addresses" }} />
      <Stack.Screen name="collections" options={{ headerShown: false }} />
      <Stack.Screen name="edit" options={{ title: "Edit profile" }} />
      <Stack.Screen name="language" options={{ title: "Language" }} />
      <Stack.Screen name="verify-email" options={{ headerShown: false }} />
      <Stack.Screen name="help" options={{ title: "Help & Support" }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="ticket-create" options={{ title: "Create ticket" }} />
      <Stack.Screen name="ticket/[id]" options={{ title: "Ticket" }} />
    </Stack>
    </>
  );
}
