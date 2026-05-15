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
        <Stack.Screen name="index" options={{ title: "My Support" }} />
        <Stack.Screen name="new" options={{ title: "Raise a ticket" }} />
        <Stack.Screen name="[ticketId]" options={{ title: "Ticket" }} />
      </Stack>
    </>
  );
}
