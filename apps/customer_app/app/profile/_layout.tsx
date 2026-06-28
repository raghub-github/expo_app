import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

const HEADER_BG = "#FFFFFF";

export default function ProfileLayout() {
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
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="subscription" options={{ headerShown: false }} />
      <Stack.Screen name="referrals" options={{ title: "Rewards & Referrals" }} />
      <Stack.Screen name="addresses" options={{ title: "Saved addresses" }} />
      <Stack.Screen name="collections" options={{ headerShown: false }} />
      <Stack.Screen name="edit" options={{ title: "Edit profile" }} />
      <Stack.Screen name="language" options={{ title: "Language" }} />
      <Stack.Screen name="verify-email" options={{ headerShown: false }} />
      <Stack.Screen name="help" options={{ title: "Help & Support" }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="accessibility" options={{ headerShown: false }} />
      <Stack.Screen name="ticket-create" options={{ title: "Create ticket" }} />
      <Stack.Screen name="ticket/[id]" options={{ title: "Ticket" }} />
      <Stack.Screen name="legal" options={{ headerShown: false }} />
      <Stack.Screen name="about" options={{ title: "About" }} />
    </Stack>
    </>
  );
}
