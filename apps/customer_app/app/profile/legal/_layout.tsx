import { Stack } from "expo-router";

export default function LegalLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#FFFFFF" },
        headerTitleStyle: { fontSize: 17, fontWeight: "600", color: "#111827" },
        headerTintColor: "#111827",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Legal & Policies" }} />
      <Stack.Screen name="[docId]" options={{ title: "Policy" }} />
    </Stack>
  );
}
