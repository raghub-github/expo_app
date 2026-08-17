import { Stack } from "expo-router";
import { ProfileTheme } from "@/constants/profileTheme";

export default function WalletLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: ProfileTheme.pageBg },
        animation: "slide_from_right",
        // See app/_layout.tsx — stops screens from re-rendering while a
        // screen is pushed on top of them.
        freezeOnBlur: true,
      }}
    />
  );
}
