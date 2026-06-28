import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

export default function PublicLegalLayout() {
  return (
    <>
      <AndroidBackHandler fallback="/(auth)/login" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#FFFFFF" },
          headerTitleStyle: { fontSize: 17, fontWeight: "600", color: "#111827" },
          headerTintColor: "#111827",
          headerShadowVisible: false,
          headerTitleAlign: "left",
        }}
      >
        <Stack.Screen name="[docId]" options={{ title: "Policy" }} />
      </Stack>
    </>
  );
}
