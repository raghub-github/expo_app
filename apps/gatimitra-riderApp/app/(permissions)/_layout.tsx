import { Stack } from "expo-router";

export default function PermissionsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="request" />
      <Stack.Screen name="battery" />
    </Stack>
  );
}

