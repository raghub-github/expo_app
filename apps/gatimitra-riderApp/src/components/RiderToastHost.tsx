import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRiderToastStore } from "@/src/stores/riderToastStore";
import { colors } from "@/src/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { useMeasuredTabBarHeight } from "@/src/hooks/useRiderBottomDock";
import { flexShrinkText } from "@/src/theme/responsiveText";

const TOAST_MS = 5000;

export function RiderToastHost() {
  const { rs, insets, width } = useResponsiveLayout();
  const tabBarHeight = useMeasuredTabBarHeight();
  const message = useRiderToastStore((s) => s.message);
  const clearToast = useRiderToastStore((s) => s.clearToast);
  const sidePad = rs(16);
  const toastMaxWidth = Math.min(width - sidePad * 2, 420);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => clearToast(), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, clearToast]);

  if (!message) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          bottom: Math.max(insets.bottom, 0) + tabBarHeight + rs(8),
          left: sidePad,
          right: sidePad,
        },
      ]}
    >
      <View style={[styles.toast, { maxWidth: toastMaxWidth, paddingHorizontal: rs(16) }]}>
        <Text style={[styles.text, flexShrinkText]} numberOfLines={4} ellipsizeMode="tail">
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    zIndex: 9999,
    alignItems: "center",
  },
  toast: {
    width: "100%",
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: {
    color: colors.background.light,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    fontWeight: "600",
  },
});
