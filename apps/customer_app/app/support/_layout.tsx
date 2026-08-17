import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

export default function SupportLayout() {
  return (
    <>
      <AndroidBackHandler />
      <Stack
        screenOptions={{
          headerShown: false,
          // See app/_layout.tsx — stops screens from re-rendering while a
          // screen is pushed on top of them.
          freezeOnBlur: true,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="raise" />
        <Stack.Screen
          name="new"
          options={{
            presentation: "transparentModal",
            animation: "fade",
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
        <Stack.Screen name="[ticketId]" />
      </Stack>
    </>
  );
}
