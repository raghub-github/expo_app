/**
 * Shared top bar for every onboarding step.
 *
 * Left  : Back chevron — navigates to the previous step (hidden on the first step). Onboarding
 *         steps use router.replace (no back stack), so Back navigates explicitly via
 *         previousOnboardingRoute().
 * Right : ⋮ menu — Logout (opens the existing rider logout sheet) and "Need help / Raise a
 *         ticket" (→ /onboarding-help pre-filled with the current step). Riders previously had
 *         no way to log out or get help until onboarding was fully complete.
 *
 * Rendered as the expo-router Stack `header` for the (onboarding) group, so it appears on all
 * steps without editing each screen.
 */
import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { useLogoutSheetStore } from "@/src/stores/logoutSheetStore";
import {
  canGoBackFromOnboardingRoute,
  previousOnboardingRoute,
} from "@/src/lib/onboarding-routes";

const BRAND = colors.primary[600];

type StackHeaderRoute = { name?: string } | undefined;

export function OnboardingTopBar({
  route,
  routeName: routeNameProp,
}: {
  /** Provided when used as an expo-router Stack `header`. */
  route?: StackHeaderRoute;
  /** Explicit override when rendered directly by a screen. */
  routeName?: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  const routeName = routeNameProp ?? route?.name ?? "";
  const showBack = canGoBackFromOnboardingRoute(routeName);

  const goBack = () => {
    const prev = previousOnboardingRoute(routeName);
    if (prev) router.replace(prev);
    else if (router.canGoBack()) router.back();
  };

  const openLogout = () => {
    setMenuOpen(false);
    // Small delay so the popover dismiss animation doesn't fight the logout sheet mount.
    setTimeout(() => useLogoutSheetStore.getState().open(), 60);
  };

  const openHelp = () => {
    setMenuOpen(false);
    router.push({ pathname: "/onboarding-help", params: { step: routeName } });
  };

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
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

      <Pressable
        onPress={() => setMenuOpen(true)}
        hitSlop={12}
        style={styles.iconChip}
        accessibilityRole="button"
        accessibilityLabel="More options"
      >
        <Ionicons name="ellipsis-vertical" size={20} color="#0F172A" />
      </Pressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { top: insets.top + 44 }]}>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={openHelp}
              accessibilityRole="button"
              accessibilityLabel="Need help or raise a ticket"
            >
              <Ionicons name="help-buoy-outline" size={18} color={BRAND} />
              <Text style={styles.menuText}>Need help / Raise a ticket</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={openLogout}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <Ionicons name="log-out-outline" size={18} color="#DC2626" />
              <Text style={[styles.menuText, { color: "#DC2626" }]}>Log out</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Transparent, floating bar (headerTransparent) — overlays each step's own top area without
  // shifting its layout. Chip backgrounds keep the icons legible on light or dark step backdrops.
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: 4,
    backgroundColor: "transparent",
  },
  iconChip: {
    width: 38,
    height: 38,
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
  spacer: { width: 38, height: 38 },
  menuBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.18)" },
  menu: {
    position: "absolute",
    right: 10,
    minWidth: 232,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  menuItemPressed: { backgroundColor: "#F1F5F9" },
  menuText: { fontSize: 14, fontWeight: "600", color: "#0F172A" },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#E2E8F0", marginHorizontal: 12 },
});
