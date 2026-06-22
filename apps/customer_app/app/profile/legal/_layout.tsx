import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEFAULT_STATUS_BAR_HEIGHT } from "@/constants/layout";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

export default function LegalLayout() {
  const insets = useSafeAreaInsets();
  const statusBarHeight = insets.top > 0 ? insets.top : DEFAULT_STATUS_BAR_HEIGHT;

  return (
    <>
      <AndroidBackHandler fallback="/profile/legal" />
      <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#FFFFFF" },
        headerTitleStyle: { fontSize: 17, fontWeight: "600", color: "#111827" },
        headerTintColor: "#111827",
        headerShadowVisible: false,
        headerStatusBarHeight: statusBarHeight,
        headerTitleAlign: "left",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Legal & Policies" }} />
      <Stack.Screen name="[docId]" options={{ title: "Policy" }} />
    </Stack>
    </>
  );
}
