import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEFAULT_STATUS_BAR_HEIGHT } from "@/constants/layout";

const HEADER_BG = "#FFFFFF";

export default function ProfileLayout() {
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top > 0 ? insets.top : DEFAULT_STATUS_BAR_HEIGHT;
  return (
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
      <Stack.Screen name="addresses" options={{ title: "Saved addresses" }} />
      <Stack.Screen name="edit" options={{ title: "Edit profile" }} />
      <Stack.Screen name="language" options={{ title: "Language" }} />
      <Stack.Screen name="verify-email" options={{ title: "Verify email" }} />
      <Stack.Screen name="help" options={{ title: "Help & Support" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="ticket-create" options={{ title: "Create ticket" }} />
      <Stack.Screen name="ticket/[id]" options={{ title: "Ticket" }} />
    </Stack>
  );
}
