import { useCallback } from "react";
import { Platform, StatusBar as NativeStatusBar } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { ProfileTheme } from "@/constants/profileTheme";
import { useWalletDark } from "@/hooks/useWalletDark";
import { DiscoveryColors } from "@/features/discovery-home/discoveryTheme";
import { useScreenChromeStore } from "@/store/screenChromeStore";

export default function WalletLayout() {
  const dark = useWalletDark();
  const barBg = dark ? DiscoveryColors.bg : ProfileTheme.pageBg;
  const barStyle = dark ? "light" : "dark";

  useFocusEffect(
    useCallback(() => {
      useScreenChromeStore.setState({
        statusBarBackground: barBg,
        statusBarStyle: barStyle,
        hideStatusBarSpacer: false,
        bootstrapActive: false,
      });
      NativeStatusBar.setHidden(false, "none");
      NativeStatusBar.setBarStyle(dark ? "light-content" : "dark-content", true);
      if (Platform.OS === "android") {
        NativeStatusBar.setTranslucent(false);
        NativeStatusBar.setBackgroundColor(barBg, true);
      }
      return () => {
        useScreenChromeStore.getState().resetStatusBarBackground();
      };
    }, [barBg, barStyle, dark])
  );

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: barBg },
        statusBarStyle: barStyle,
        statusBarBackgroundColor: barBg,
        animation: "slide_from_right",
        freezeOnBlur: true,
      }}
    />
  );
}
