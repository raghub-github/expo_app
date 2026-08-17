import { Stack } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

export default function AuthLayout() {
  return (
    <>
      <AndroidBackHandler />
      <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="otp" />
    </Stack>
    </>
  );
}
