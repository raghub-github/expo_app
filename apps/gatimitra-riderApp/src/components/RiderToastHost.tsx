import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRiderToastStore } from "@/src/stores/riderToastStore";
import { colors } from "@/src/theme";

const TOAST_MS = 5000;

export function RiderToastHost() {
  const insets = useSafeAreaInsets();
  const message = useRiderToastStore((s) => s.message);
  const clearToast = useRiderToastStore((s) => s.clearToast);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => clearToast(), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, clearToast]);

  if (!message) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 88 }]}>
      <View style={styles.toast}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: "center",
  },
  toast: {
    maxWidth: 420,
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingHorizontal: 16,
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
