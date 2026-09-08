import { Stack } from "expo-router";
import { RIDER_AUTH_BG } from "@/src/theme/riderAuthTheme";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: RIDER_AUTH_BG } }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
