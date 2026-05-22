import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

export default function SupportLayout() {
  return (
    <>
      <AndroidBackHandler />
      <Stack
        screenOptions={{
          headerShown: true,
          headerBackTitle: "Back",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="new" options={{ title: "Raise a ticket" }} />
        <Stack.Screen name="[ticketId]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
