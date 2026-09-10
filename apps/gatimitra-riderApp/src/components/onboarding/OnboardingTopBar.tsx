/**
 * Shared top bar for every onboarding / verification step.
 *
 * Left  : Back — one step previous (sub-wizards can override via setOnboardingBackOverride).
 * Right : Help + Language (same compact pattern across all KYC steps).
 */
import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform, StatusBar as RnStatusBar } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderLanguageIcon } from "@/src/components/header/HeaderActionIcons";
import { LanguageSelectionSheet } from "@/src/components/language/LanguageSelectionSheet";
import { runOnboardingBackOverride } from "@/src/lib/onboarding-back-override";
import {
  canGoBackFromOnboardingRoute,
  previousOnboardingRoute,
} from "@/src/lib/onboarding-routes";
import { RIDER_AUTH_BG } from "@/src/theme/riderAuthTheme";

/** Must match onboarding page / Stack contentStyle background. */
export const ONBOARDING_PAGE_BG = "#f4fbf6";

type StackHeaderRoute = { name?: string } | undefined;

export function OnboardingTopBar({
  route,
  routeName: routeNameProp,
}: {
  route?: StackHeaderRoute;
  routeName?: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [languageOpen, setLanguageOpen] = useState(false);

  const routeName = routeNameProp ?? route?.name ?? "";
  const showBack = canGoBackFromOnboardingRoute(routeName);
  const pageBg = routeName === "language" ? RIDER_AUTH_BG : ONBOARDING_PAGE_BG;

  useEffect(() => {
    if (Platform.OS === "android") {
      RnStatusBar.setBackgroundColor?.(pageBg);
      RnStatusBar.setTranslucent?.(true);
    }
  }, [pageBg]);

  const goBack = () => {
    if (runOnboardingBackOverride()) return;
    const prev = previousOnboardingRoute(routeName);
    if (prev) router.replace(prev);
    else if (router.canGoBack()) router.back();
  };

  const openHelp = () => {
    router.push({ pathname: "/onboarding-help", params: { step: routeName } });
  };

  return (
    <>
      <StatusBar style="dark" backgroundColor={pageBg} />
      <View
        style={[styles.bar, { paddingTop: insets.top + 10, backgroundColor: pageBg }]}
        pointerEvents="box-none"
      >
        {showBack ? (
          <Pressable
            onPress={goBack}
            hitSlop={12}
            style={styles.iconChip}
            accessibilityRole="button"
            accessibilityLabel="Go back one step"
          >
            <Ionicons name="arrow-back" size={22} color="#0F172A" />
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}

        <View style={{ flex: 1 }} pointerEvents="none" />

        <View style={styles.rightRow}>
          <Pressable
            onPress={openHelp}
            hitSlop={8}
            style={styles.helpChip}
            accessibilityRole="button"
            accessibilityLabel="Help"
          >
            <Ionicons name="headset-outline" size={16} color="#0F172A" />
            <Text
              style={styles.helpLabel}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Help
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setLanguageOpen(true)}
            hitSlop={12}
            style={styles.iconChip}
            accessibilityRole="button"
            accessibilityLabel="Change language"
          >
            <HeaderLanguageIcon size={18} color="#0F172A" />
          </Pressable>
        </View>
      </View>

      <LanguageSelectionSheet
        visible={languageOpen}
        onClose={() => setLanguageOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
    paddingHorizontal: 10,
    paddingBottom: 10,
    // Default; overridden per-route so status-bar strip matches page bg.
    backgroundColor: ONBOARDING_PAGE_BG,
  },
  rightRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 8,
  },
  iconChip: {
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  helpChip: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 6,
    height: 38,
    maxWidth: 120,
    paddingHorizontal: 12,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.92)",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  helpLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    flexShrink: 1,
  },
  spacer: { width: 38, height: 38, flexShrink: 0 },
});
